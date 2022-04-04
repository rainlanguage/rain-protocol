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
type OrderHash is uint256;
type OrderLiveness is uint256;

struct DepositConfig {
    address depositor;
    address token;
    VaultId vaultId;
    uint256 amount;
}

struct WithdrawConfig {
    address token;
    VaultId vaultId;
    uint256 amount;
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
    uint256 fundsCleared;
}

struct ClearStateChange {
    uint256 aOutput;
    uint256 bOutput;
    uint256 aInput;
    uint256 bInput;
}

uint256 constant VM_SOURCE_INDEX = 0;
uint256 constant OPCODE_COUNTERPARTY = 0;
uint256 constant OPCODE_COUNTERPARTY_FUNDS_CLEARED = 1;
uint256 constant LOCAL_OPS_LENGTH = 2;

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
    event Clear(
        address sender,
        OrderConfig a_,
        OrderConfig b_,
        BountyConfig bountyConfig,
        ClearStateChange stateChange
    );

    uint256 private immutable localOpsStart;

    // order hash => order liveness
    mapping(OrderHash => OrderLiveness) private orders;
    // depositor => token => vault => token amount.
    mapping(address => mapping(address => mapping(VaultId => uint256)))
        private vaults;
    // funds were cleared from the owner of the hashed order.
    // order owner is the counterparty funds were cleared to.
    // order hash => order owner => token amount
    mapping(OrderHash => mapping(address => uint256)) private cleared;

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

    function _orderHash(OrderConfig calldata config_)
        internal
        pure
        returns (OrderHash)
    {
        return OrderHash.wrap(uint256(keccak256(abi.encode(config_))));
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

    function withdraw(WithdrawConfig calldata config_)
        external
        notAppendOnlyVaultId(config_.vaultId)
    {
        vaults[msg.sender][config_.token][config_.vaultId] -= config_.amount;
        emit Withdraw(msg.sender, config_);
        IERC20(config_.token).safeTransfer(msg.sender, config_.amount);
    }

    function addOrder(OrderConfig calldata config_)
        external
        onlyOrderOwner(config_)
    {
        OrderHash orderHash_ = _orderHash(config_);
        if (
            OrderLiveness.unwrap(orders[orderHash_]) ==
            OrderLiveness.unwrap(ORDER_DEAD)
        ) {
            orders[_orderHash(config_)] = ORDER_LIVE;
            emit OrderLive(msg.sender, config_);
        }
    }

    function removeOrder(OrderConfig calldata config_)
        external
        onlyOrderOwner(config_)
        notAppendOnlyVaultId(config_.inputVaultId)
        notAppendOnlyVaultId(config_.outputVaultId)
    {
        OrderHash orderHash_ = _orderHash(config_);
        if (
            OrderLiveness.unwrap(orders[orderHash_]) ==
            OrderLiveness.unwrap(ORDER_LIVE)
        ) {
            orders[_orderHash(config_)] = ORDER_DEAD;
            emit OrderDead(msg.sender, config_);
        }
    }

    function clear(
        OrderConfig calldata a_,
        OrderConfig calldata b_,
        BountyConfig calldata bountyConfig_
    ) external {
        OrderHash aHash_ = _orderHash(a_);
        OrderHash bHash_ = _orderHash(b_);
        {
            require(a_.outputToken == b_.inputToken, "TOKEN_MISMATCH");
            require(b_.outputToken == a_.inputToken, "TOKEN_MISMATCH");
            require(
                OrderLiveness.unwrap(orders[aHash_]) ==
                    OrderLiveness.unwrap(ORDER_LIVE),
                "A_NOT_LIVE"
            );
            require(
                OrderLiveness.unwrap(orders[bHash_]) ==
                    OrderLiveness.unwrap(ORDER_LIVE),
                "B_NOT_LIVE"
            );

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

        ClearStateChange memory stateChange_;

        {
            uint256 aPrice_;
            uint256 bPrice_;
            uint256 aOutputMax_;
            uint256 bOutputMax_;

            {
                // Price is input per output for both a_ and b_.
                aPrice_ = a_.vmState.stack[a_.vmState.stackIndex - 1];
                bPrice_ = b_.vmState.stack[b_.vmState.stackIndex - 1];
                // a_ and b_ can both set a maximum output from the VM.
                aOutputMax_ = a_.vmState.stack[a_.vmState.stackIndex - 2];
                bOutputMax_ = a_.vmState.stack[b_.vmState.stackIndex - 2];
            }

            // outputs are capped by the remaining funds in their output vault.
            {
                aOutputMax_ = aOutputMax_.min(
                    vaults[a_.owner][a_.outputToken][a_.outputVaultId]
                );
                bOutputMax_ = bOutputMax_.min(
                    vaults[b_.owner][b_.outputToken][b_.outputVaultId]
                );
            }

            stateChange_.aOutput = aOutputMax_.min(
                bOutputMax_.fixedPointMul(bPrice_)
            );
            stateChange_.bOutput = bOutputMax_.min(
                aOutputMax_.fixedPointMul(aPrice_)
            );

            stateChange_.aInput = stateChange_.aOutput.fixedPointMul(aPrice_);
            stateChange_.bInput = stateChange_.bOutput.fixedPointMul(bPrice_);
        }

        if (stateChange_.aOutput > 0) {
            vaults[a_.owner][a_.outputToken][a_.outputVaultId] -= stateChange_
                .aOutput;
            // A counts funds paid to cover the bounty as cleared for B.
            cleared[aHash_][b_.owner] += stateChange_.aOutput;
        }
        if (stateChange_.bOutput > 0) {
            vaults[b_.owner][b_.outputToken][b_.outputVaultId] -= stateChange_
                .bOutput;
            // B counts funds paid to cover the bounty as cleared for A.
            cleared[bHash_][a_.owner] += stateChange_.bOutput;
        }
        if (stateChange_.aInput > 0) {
            vaults[a_.owner][a_.inputToken][a_.inputVaultId] += stateChange_
                .aInput;
        }
        if (stateChange_.bInput > 0) {
            vaults[b_.owner][b_.inputToken][b_.inputVaultId] += stateChange_
                .bInput;
        }
        {
            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            uint256 aBounty_ = stateChange_.aOutput - stateChange_.bInput;
            uint256 bBounty_ = stateChange_.bOutput - stateChange_.aInput;
            if (aBounty_ > 0) {
                vaults[msg.sender][a_.outputToken][
                    bountyConfig_.aVaultId
                ] += aBounty_;
            }
            if (bBounty_ > 0) {
                vaults[msg.sender][b_.outputToken][
                    bountyConfig_.bVaultId
                ] += bBounty_;
            }
        }
        emit Clear(msg.sender, a_, b_, bountyConfig_, stateChange_);
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
                state_.stack[state_.stackIndex] = counterpartyContext_
                    .fundsCleared;
            }
            state_.stackIndex++;
        }
    }
}
