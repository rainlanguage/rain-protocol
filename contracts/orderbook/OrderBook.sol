// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../vm/runtime/StandardVM.sol";
import "../vm/runtime/LibStackTop.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../math/FixedPointMath.sol";
import "../vm/ops/AllStandardOps.sol";
import "./libraries/Order.sol";

struct DepositConfig {
    address token;
    uint256 vaultId;
    uint256 amount;
}

struct WithdrawConfig {
    address token;
    uint256 vaultId;
    uint256 amount;
}

struct ClearConfig {
    uint256 aInputIndex;
    uint256 aOutputIndex;
    uint256 bInputIndex;
    uint256 bOutputIndex;
    uint256 aBountyVaultId;
    uint256 bBountyVaultId;
}

struct EvalContext {
    OrderHash orderHash;
    address counterparty;
}

struct ClearStateChange {
    uint256 aOutput;
    uint256 bOutput;
    uint256 aInput;
    uint256 bInput;
}

uint256 constant LOCAL_OPS_LENGTH = 2;
uint256 constant TRACKING_FLAG_CLEARED_ORDER = 0x1;
uint256 constant TRACKING_FLAG_CLEARED_COUNTERPARTY = 0x2;

library LibEvalContext {
    function toContext(EvalContext memory evalContext_)
        internal
        pure
        returns (uint256[] memory context_)
    {
        context_ = new uint256[](2);
        context_[0] = OrderHash.unwrap(evalContext_.orderHash);
        context_[1] = uint256(uint160(evalContext_.counterparty));
    }
}

contract OrderBook is StandardVM {
    using LibVMState for bytes;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using SafeERC20 for IERC20;
    using Math for uint256;
    using FixedPointMath for uint256;
    using LibOrder for OrderLiveness;
    using LibOrder for Order;
    using LibEvalContext for EvalContext;

    event Deposit(address sender, DepositConfig config);
    /// @param sender `msg.sender` withdrawing tokens.
    /// @param config All config sent to the `withdraw` call.
    /// @param amount The amount of tokens withdrawn, can be less than the
    /// config amount if the vault does not have the funds available to cover
    /// the config amount.
    event Withdraw(address sender, WithdrawConfig config, uint256 amount);
    event OrderLive(address sender, Order config);
    event OrderDead(address sender, Order config);
    event Clear(address sender, Order a_, Order b_, ClearConfig clearConfig);
    event AfterClear(ClearStateChange stateChange);

    // order hash => order liveness
    mapping(OrderHash => OrderLiveness) private orders;
    // depositor => token => vault id => token amount.
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        private vaults;

    // funds were cleared from the hashed order to anyone.
    mapping(OrderHash => uint256) private clearedOrder;
    // funds were cleared from the owner of the hashed order.
    // order owner is the counterparty funds were cleared to.
    // order hash => order owner => token amount
    mapping(OrderHash => mapping(address => uint256))
        private clearedCounterparty;

    constructor(address vmIntegrity_) StandardVM(vmIntegrity_) {}

    function _isTracked(uint256 tracking_, uint256 mask_)
        internal
        pure
        returns (bool)
    {
        return (tracking_ & mask_) > 0;
    }

    function deposit(DepositConfig calldata config_) external {
        vaults[msg.sender][config_.token][config_.vaultId] += config_.amount;
        emit Deposit(msg.sender, config_);
        IERC20(config_.token).safeTransferFrom(
            msg.sender,
            address(this),
            config_.amount
        );
    }

    /// Allows the sender to withdraw any tokens from their own vaults.
    /// @param config_ All config required to withdraw. Notably if the amount
    /// is less than the current vault balance then the vault will be cleared
    /// to 0 rather than the withdraw transaction reverting.
    function withdraw(WithdrawConfig calldata config_) external {
        uint256 vaultBalance_ = vaults[msg.sender][config_.token][
            config_.vaultId
        ];
        uint256 withdrawAmount_ = config_.amount.min(vaultBalance_);
        vaults[msg.sender][config_.token][config_.vaultId] =
            vaultBalance_ -
            withdrawAmount_;
        emit Withdraw(msg.sender, config_, withdrawAmount_);
        IERC20(config_.token).safeTransfer(msg.sender, withdrawAmount_);
    }

    function addOrder(OrderConfig calldata orderConfig_) external {
        Order memory order_ = LibOrder.fromOrderConfig(
            IRainVMIntegrity(vmIntegrity),
            buildStateBytes,
            orderConfig_
        );
        OrderHash orderHash_ = order_.hash();
        if (orders[orderHash_].isDead()) {
            orders[orderHash_] = ORDER_LIVE;
            emit OrderLive(msg.sender, order_);
        }
    }

    function removeOrder(Order calldata order_) external {
        require(msg.sender == order_.owner, "OWNER");
        OrderHash orderHash_ = order_.hash();
        if (orders[orderHash_].isLive()) {
            orders[orderHash_] = ORDER_DEAD;
            emit OrderDead(msg.sender, order_);
        }
    }

    function clear(
        Order memory a_,
        Order memory b_,
        ClearConfig calldata clearConfig_
    ) external {
        OrderHash aHash_ = a_.hash();
        OrderHash bHash_ = b_.hash();
        {
            require(
                a_.validOutputs[clearConfig_.aOutputIndex].token ==
                    b_.validInputs[clearConfig_.bInputIndex].token,
                "TOKEN_MISMATCH"
            );
            require(
                b_.validOutputs[clearConfig_.bOutputIndex].token ==
                    a_.validInputs[clearConfig_.aInputIndex].token,
                "TOKEN_MISMATCH"
            );
            require(orders[aHash_].isLive(), "A_NOT_LIVE");
            require(orders[bHash_].isLive(), "B_NOT_LIVE");
        }

        ClearStateChange memory stateChange_;

        {
            // Price is input per output for both a_ and b_.
            uint256 aPrice_;
            uint256 bPrice_;
            // a_ and b_ can both set a maximum output from the VM.
            uint256 aOutputMax_;
            uint256 bOutputMax_;

            // emit the Clear event before a_ and b_ are mutated due to the
            // VM execution in eval.
            emit Clear(msg.sender, a_, b_, clearConfig_);

            unchecked {
                VMState memory vmState_;
                {
                    vmState_ = a_.vmState.fromBytesPacked(
                        EvalContext(aHash_, b_.owner).toContext(),
                        eval
                    );
                    (aOutputMax_, aPrice_) = eval(
                        vmState_,
                        ENTRYPOINT,
                        vmState_.stackBottom
                    ).peek2();
                }

                {
                    vmState_ = b_.vmState.fromBytesPacked(
                        EvalContext(bHash_, a_.owner).toContext(),
                        eval
                    );
                    (bOutputMax_, bPrice_) = eval(
                        vmState_,
                        ENTRYPOINT,
                        vmState_.stackBottom
                    ).peek2();
                }
            }

            // outputs are capped by the remaining funds in their output vault.
            {
                aOutputMax_ = aOutputMax_.min(
                    vaults[a_.owner][
                        a_.validOutputs[clearConfig_.aOutputIndex].token
                    ][a_.validOutputs[clearConfig_.aOutputIndex].vaultId]
                );
                bOutputMax_ = bOutputMax_.min(
                    vaults[b_.owner][
                        b_.validOutputs[clearConfig_.bOutputIndex].token
                    ][b_.validOutputs[clearConfig_.bOutputIndex].vaultId]
                );
            }

            stateChange_.aOutput = aOutputMax_.min(
                bOutputMax_.fixedPointMul(bPrice_)
            );
            stateChange_.bOutput = bOutputMax_.min(
                aOutputMax_.fixedPointMul(aPrice_)
            );

            require(
                stateChange_.aOutput > 0 || stateChange_.bOutput > 0,
                "0_CLEAR"
            );

            stateChange_.aInput = stateChange_.aOutput.fixedPointMul(aPrice_);
            stateChange_.bInput = stateChange_.bOutput.fixedPointMul(bPrice_);
        }

        if (stateChange_.aOutput > 0) {
            vaults[a_.owner][a_.validOutputs[clearConfig_.aOutputIndex].token][
                a_.validOutputs[clearConfig_.aOutputIndex].vaultId
            ] -= stateChange_.aOutput;
            if (_isTracked(a_.tracking, TRACKING_FLAG_CLEARED_ORDER)) {
                clearedOrder[aHash_] += stateChange_.aOutput;
            }
            if (_isTracked(a_.tracking, TRACKING_FLAG_CLEARED_COUNTERPARTY)) {
                // A counts funds paid to cover the bounty as cleared for B.
                clearedCounterparty[aHash_][b_.owner] += stateChange_.aOutput;
            }
        }
        if (stateChange_.bOutput > 0) {
            vaults[b_.owner][b_.validOutputs[clearConfig_.bOutputIndex].token][
                b_.validOutputs[clearConfig_.bOutputIndex].vaultId
            ] -= stateChange_.bOutput;
            if (_isTracked(b_.tracking, TRACKING_FLAG_CLEARED_ORDER)) {
                clearedOrder[bHash_] += stateChange_.bOutput;
            }
            if (_isTracked(b_.tracking, TRACKING_FLAG_CLEARED_COUNTERPARTY)) {
                clearedCounterparty[bHash_][a_.owner] += stateChange_.bOutput;
            }
        }
        if (stateChange_.aInput > 0) {
            vaults[a_.owner][a_.validInputs[clearConfig_.aInputIndex].token][
                a_.validInputs[clearConfig_.aInputIndex].vaultId
            ] += stateChange_.aInput;
        }
        if (stateChange_.bInput > 0) {
            vaults[b_.owner][b_.validInputs[clearConfig_.bInputIndex].token][
                b_.validInputs[clearConfig_.bInputIndex].vaultId
            ] += stateChange_.bInput;
        }
        {
            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            uint256 aBounty_ = stateChange_.aOutput - stateChange_.bInput;
            uint256 bBounty_ = stateChange_.bOutput - stateChange_.aInput;
            if (aBounty_ > 0) {
                vaults[msg.sender][
                    a_.validOutputs[clearConfig_.aOutputIndex].token
                ][clearConfig_.aBountyVaultId] += aBounty_;
            }
            if (bBounty_ > 0) {
                vaults[msg.sender][
                    b_.validOutputs[clearConfig_.bOutputIndex].token
                ][clearConfig_.bBountyVaultId] += bBounty_;
            }
        }

        emit AfterClear(stateChange_);
    }

    function _opOrderFundsCleared(uint256 orderHash_)
        internal
        view
        returns (uint256)
    {
        return clearedOrder[OrderHash.wrap(orderHash_)];
    }

    function opOrderFundsCleared(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_opOrderFundsCleared);
    }

    function _orderCounterpartyFundsCleared(
        uint256 orderHash_,
        uint256 counterparty_
    ) internal view returns (uint256) {
        return
            clearedCounterparty[OrderHash.wrap(orderHash_)][
                address(uint160(counterparty_))
            ];
    }

    function opOrderCounterpartyFundsCleared(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_orderCounterpartyFundsCleared);
    }

    function localEvalFunctionPointers()
        internal
        pure
        override
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {
        localFnPtrs_ = new function(VMState memory, Operand, StackTop)
            view
            returns (StackTop)[](2);
        localFnPtrs_[0] = opOrderFundsCleared;
        localFnPtrs_[1] = opOrderCounterpartyFundsCleared;
    }
}
