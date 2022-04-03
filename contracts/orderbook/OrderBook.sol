// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/RainVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../math/FixedPointMath.sol";
import "../vm/ops/AllStandardOps.sol";

type VaultId is int256;
type OrderHash is uint;
type OrderLiveness is uint;

struct DepositConfig {
    address depositor;
    address token;
    VaultId vaultId;
    uint amount;
}

struct WithdrawConfig {
    address token;
    VaultId vaultId;
    uint amount;
}

struct OrderConfig {
    address owner;
    address inputToken;
    VaultId inputVaultId;
    address outputToken;
    VaultId outputVaultId;
    State vmState;
}

struct BountyConfig {
    VaultId aVaultId;
    VaultId bVaultId;
}

struct CounterpartyContext {
    address counterparty;
    uint fundsCleared;
}

uint constant VM_SOURCE_INDEX = 0;
uint constant OPCODE_COUNTERPARTY = 0;
uint constant OPCODE_COUNTERPARTY_FUNDS_CLEARED = 1;
uint constant LOCAL_OPS_LENGTH = 2;

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

contract OrderBook is RainVM {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using FixedPointMath for uint256;
    event Deposit(address sender, DepositConfig config);
    event Withdraw(address sender, WithdrawConfig config);
    event OrderLive(address sender, OrderConfig config);
    event OrderDead(address sender, OrderConfig config);
    event Clear(address sender, OrderConfig a_, OrderConfig b_);

    uint private immutable localOpsStart;

    // order hash => order liveness
    mapping(OrderHash => OrderLiveness) private orders;
    // depositor => token => vault => token amount.
    mapping(address => mapping(address => mapping(VaultId => uint)))
        private vaults;
    // funds were cleared from the owner of the hashed order.
    // order owner is the counterparty funds were cleared to.
    // order hash => order owner => token amount
    mapping(OrderHash => mapping(address => uint)) private cleared;

    constructor() {
        localOpsStart = ALL_STANDARD_OPS_START + ALL_STANDARD_OPS_LENGTH;
    }

    modifier onlyOrderOwner(OrderConfig calldata config_) {
        require(msg.sender == config_.owner, "NOT_ORDER_OWNER");
        _;
    }

    modifier notAppendOnlyVaultId(VaultId vaultId_) {
        require(VaultId.unwrap(vaultId_) >= 0, "APPEND_ONLY_VAULT_ID");
        _;
    }

    function _orderHash(OrderConfig calldata config_) internal pure returns (OrderHash) {
        return OrderHash.wrap(uint(keccak256(abi.encode(config_))));
    }

    function deposit(DepositConfig calldata config_) external {
        vaults[config_.depositor][config_.token][config_.vaultId] += config_
            .amount;
        emit Deposit(msg.sender, config_);
        IERC20(config_.token).safeTransferFrom(
            msg.sender,
            address(this),
            config_.amount
        );
    }

    function withdraw(WithdrawConfig calldata config_) external notAppendOnlyVaultId(config_.vaultId) {
        vaults[msg.sender][config_.token][config_.vaultId] -= config_.amount;
        emit Withdraw(msg.sender, config_);
        IERC20(config_.token).safeTransfer(msg.sender, config_.amount);
    }

    function addOrder(OrderConfig calldata config_) external onlyOrderOwner(config_) {
        OrderHash orderHash_ = _orderHash(config_);
        if (OrderLiveness.unwrap(orders[orderHash_]) == OrderLiveness.unwrap(ORDER_DEAD)) {
            orders[_orderHash(config_)] = ORDER_LIVE;
            emit OrderLive(msg.sender, config_);
        }
    }

    function removeOrder(OrderConfig calldata config_) external onlyOrderOwner(config_) notAppendOnlyVaultId(config_.inputVaultId) notAppendOnlyVaultId(config_.outputVaultId) {
        OrderHash orderHash_ = _orderHash(config_);
        if (OrderLiveness.unwrap(orders[orderHash_]) == OrderLiveness.unwrap(ORDER_LIVE)) {
        orders[_orderHash(config_)] = ORDER_DEAD;
        emit OrderDead(msg.sender, config_);
        }
    }

    function clear(OrderConfig calldata a_, OrderConfig calldata b_, BountyConfig calldata bountyConfig_) external {
        {
            require(a_.outputToken == b_.inputToken, "TOKEN_MISMATCH");
            require(b_.outputToken == a_.inputToken, "TOKEN_MISMATCH");
        OrderHash aHash_ = _orderHash(a_);
        OrderHash bHash_ = _orderHash(b_);
        require(OrderLiveness.unwrap(orders[aHash_]) == OrderLiveness.unwrap(ORDER_LIVE), "A_NOT_LIVE");
        require(OrderLiveness.unwrap(orders[bHash_]) == OrderLiveness.unwrap(ORDER_LIVE), "B_NOT_LIVE");

        // Eval the VM for both orders.
        eval(
            abi.encode(
                CounterpartyContext(b_.owner, cleared[aHash_][b_.owner])
            ),
            a_.vmState,
            VM_SOURCE_INDEX
        );
        eval(
            abi.encode(
                CounterpartyContext(a_.owner, cleared[bHash_][a_.owner])
            ),
            b_.vmState,
            VM_SOURCE_INDEX
        );
}

        uint aOutput_;
        uint bOutput_;
        uint aInput_;
        uint bInput_;
        uint aBounty_;
        uint bBounty_;

        {
            uint aPrice_;
            uint bPrice_;
            uint aOutputMax_;
            uint bOutputMax_;

            {
                // Price is input per output for both a_ and b_.
                aPrice_ = a_.vmState.stack[a_.vmState.stackIndex - 1];
                bPrice_ = b_.vmState.stack[b_.vmState.stackIndex - 1];
                aOutputMax_ = a_.vmState.stack[a_.vmState.stackIndex - 2];
                bOutputMax_ = a_.vmState.stack[b_.vmState.stackIndex - 2];

            }

            // a_ and b_ can both set a maximum output from the VM and are both
            // limited to the remaining funds in their output vault.
            {
                aOutputMax_ = aOutputMax_.min(vaults[a_.owner][a_.outputToken][a_.outputVaultId]);
                bOutputMax_ = bOutputMax_.min(vaults[b_.owner][b_.outputToken][b_.outputVaultId]);
            }

            aOutput_ = aOutputMax_.min(bOutputMax_ * bPrice_);
            bOutput_ = bOutputMax_.min(aOutputMax_ * aPrice_);

            aInput_ = aOutput_ * aPrice_;
            bInput_ = bOutput_ * bPrice_;

            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            aBounty_ = aOutput_ - bInput_;
            bBounty_ = bOutput_ - aInput_;
        }

        if (aOutput_ > 0) {
            vaults[a_.owner][a_.outputToken][a_.outputVaultId] -= aOutput_;
        }
        if (bOutput_ > 0) {
            vaults[b_.owner][b_.outputToken][b_.outputVaultId] -= bOutput_;
        }
        if (aInput_ > 0) {
            vaults[a_.owner][a_.inputToken][a_.inputVaultId] += aInput_;
        }
        if (bInput_ > 0) {
            vaults[b_.owner][b_.inputToken][b_.inputVaultId] += bInput_;
        }
        if (aBounty_ > 0) {
            vaults[msg.sender][a_.outputToken][bountyConfig_.aVaultId] += aBounty_;
        }
        if (bBounty_ > 0) {
            vaults[msg.sender][b_.outputToken][bountyConfig_.bVaultId] += bBounty_;
        }

    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        if (opcode_ < localOpsStart) {
            AllStandardOps.applyOp(
                state_,
                opcode_ - ALL_STANDARD_OPS_START,
                operand_
            );
        } else {
            opcode_ -= localOpsStart;
            require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
            CounterpartyContext memory counterpartyContext_ = abi.decode(
                context_,
                (CounterpartyContext)
            );
            if (opcode_ == OPCODE_COUNTERPARTY) {
                state_.stack[state_.stackIndex] = uint256(
                    uint160(counterpartyContext_.counterparty)
                );
            } else if (opcode_ == OPCODE_COUNTERPARTY_FUNDS_CLEARED) {
                state_.stack[state_.stackIndex] = counterpartyContext_.fundsCleared;
            }
            state_.stackIndex++;
        }
    }
}
