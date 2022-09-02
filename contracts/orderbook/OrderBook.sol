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
import "../idempotent/LibIdempotentFlag.sol";
import "./OrderBookIntegrity.sol";

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
    uint256 aInputIOIndex;
    uint256 aOutputIOIndex;
    uint256 bInputIOIndex;
    uint256 bOutputIOIndex;
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
    IdempotentFlag aFlag;
    IdempotentFlag bFlag;
}

struct TakeOrderConfig {
    Order order;
    uint256 inputIOIndex;
    uint256 outputIOIndex;
}

struct TakeOrdersConfig {
    address output;
    address input;
    uint256 minimumInput;
    uint256 maximumInput;
    uint256 maximumIORatio;
    TakeOrderConfig[] orders;
}

uint256 constant LOCAL_OPS_LENGTH = 2;

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
    using LibVMState for VMState;
    using LibIdempotentFlag for IdempotentFlag;

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
    event TakeOrder(
        address sender,
        TakeOrderConfig takeOrder,
        uint256 input,
        uint256 output
    );

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

    function _calculateOrderIO(
        Order memory order_,
        uint256 outputIOIndex_,
        address counterparty_
    ) internal view returns (uint256 orderOutputMax_, uint256 orderIORatio_) {
        VMState memory vmState_ = order_.vmState.deserialize(
            EvalContext(order_.hash(), counterparty_).toContext()
        );
        (orderOutputMax_, orderIORatio_) = vmState_.eval().peek2();

        // The order owner can't send more than the smaller of their vault
        // balance or their per-order limit.
        IO memory outputIO_ = order_.validOutputs[outputIOIndex_];
        orderOutputMax_ = orderOutputMax_.min(
            vaults[order_.owner][outputIO_.token][outputIO_.vaultId]
        );
    }

    function _recordVaultIO(
        Order memory order_,
        address counterparty_,
        uint256 inputIOIndex_,
        uint256 input_,
        uint256 outputIOIndex_,
        uint256 output_
    ) internal {
        IO memory io_;
        if (input_ > 0) {
            io_ = order_.validInputs[inputIOIndex_];
            vaults[order_.owner][io_.token][io_.vaultId] += input_;
        }
        if (output_ > 0) {
            io_ = order_.validOutputs[outputIOIndex_];
            vaults[order_.owner][io_.token][io_.vaultId] -= output_;
            if (_isTracked(order_.tracking, TRACKING_FLAG_CLEARED_ORDER)) {
                clearedOrder[order_.hash()] += output_;
            }
            if (
                _isTracked(order_.tracking, TRACKING_FLAG_CLEARED_COUNTERPARTY)
            ) {
                clearedCounterparty[order_.hash()][counterparty_] += output_;
            }
        }
    }

    function takeOrders(TakeOrdersConfig calldata takeOrders_)
        external
        returns (uint256 totalInput_, uint256 totalOutput_)
    {
        uint256 i_ = 0;
        TakeOrderConfig memory takeOrder_;
        Order memory order_;
        uint256 remainingInput_ = takeOrders_.maximumInput;
        while (i_ < takeOrders_.orders.length && remainingInput_ > 0) {
            takeOrder_ = takeOrders_.orders[i_];
            order_ = takeOrder_.order;
            require(
                order_.validInputs[takeOrder_.inputIOIndex].token ==
                    takeOrders_.output,
                "TOKEN_MISMATCH"
            );
            require(
                order_.validOutputs[takeOrder_.outputIOIndex].token ==
                    takeOrders_.input,
                "TOKEN_MISMATCH"
            );

            (
                uint256 orderOutputMax_,
                uint256 orderIORatio_
            ) = _calculateOrderIO(order_, takeOrder_.outputIOIndex, msg.sender);

            // Skip orders that are too expensive rather than revert as we have
            // no way of knowing if a specific order becomes too expensive
            // between submitting to mempool and execution, but other orders may
            // be valid so we want to take advantage of those if possible.
            if (
                orderIORatio_ <= takeOrders_.maximumIORatio &&
                orderOutputMax_ > 0
            ) {
                uint256 input_ = remainingInput_.min(orderOutputMax_);
                uint256 output_ = input_.fixedPointMul(orderIORatio_);

                remainingInput_ -= input_;
                totalOutput_ += output_;

                _recordVaultIO(
                    order_,
                    msg.sender,
                    takeOrder_.inputIOIndex,
                    output_,
                    takeOrder_.outputIOIndex,
                    input_
                );
                emit TakeOrder(msg.sender, takeOrder_, input_, output_);
            }

            unchecked {
                i_++;
            }
        }
        totalInput_ = takeOrders_.maximumInput - remainingInput_;
        require(totalInput_ >= takeOrders_.minimumInput, "MIN_INPUT");
        IERC20(takeOrders_.output).safeTransferFrom(
            msg.sender,
            address(this),
            totalOutput_
        );
        IERC20(takeOrders_.input).safeTransfer(msg.sender, totalInput_);
    }

    function clear(
        Order memory a_,
        Order memory b_,
        ClearConfig calldata clearConfig_
    ) external {
        {
            require(a_.owner != b_.owner, "SAME_OWNER");
            require(
                a_.validOutputs[clearConfig_.aOutputIOIndex].token ==
                    b_.validInputs[clearConfig_.bInputIOIndex].token,
                "TOKEN_MISMATCH"
            );
            require(
                b_.validOutputs[clearConfig_.bOutputIOIndex].token ==
                    a_.validInputs[clearConfig_.aInputIOIndex].token,
                "TOKEN_MISMATCH"
            );
            require(orders[a_.hash()].isLive(), "A_NOT_LIVE");
            require(orders[b_.hash()].isLive(), "B_NOT_LIVE");
        }

        ClearStateChange memory stateChange_;

        {
            // IORatio is input per output for both a_ and b_.
            uint256 aIORatio_;
            uint256 bIORatio_;
            // a_ and b_ can both set a maximum output from the VM.
            uint256 aOutputMax_;
            uint256 bOutputMax_;

            // emit the Clear event before a_ and b_ are mutated due to the
            // VM execution in eval.
            emit Clear(msg.sender, a_, b_, clearConfig_);

<<<<<<< HEAD
            unchecked {
                {
                    VMState memory state_ = a_.vmState.deserialize(
                        EvalContext(a_.hash(), b_.owner).toContext()
                    );
                    stateChange_.aFlag = IdempotentFlag.wrap(state_.scratch);
                    (aOutputMax_, aPrice_) = state_.eval().peek2();
                }

                {
                    VMState memory state_ = b_.vmState.deserialize(
                        EvalContext(b_.hash(), a_.owner).toContext()
                    );
                    stateChange_.bFlag = IdempotentFlag.wrap(state_.scratch);
                    (bOutputMax_, bPrice_) = state_.eval().peek2();
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
=======
            (aOutputMax_, aIORatio_) = _calculateOrderIO(
                a_,
                clearConfig_.aOutputIOIndex,
                b_.owner
            );
            (bOutputMax_, bIORatio_) = _calculateOrderIO(
                b_,
                clearConfig_.bOutputIOIndex,
                a_.owner
            );
>>>>>>> develop

            stateChange_.aOutput = aOutputMax_.min(
                bOutputMax_.fixedPointMul(bIORatio_)
            );
            stateChange_.bOutput = bOutputMax_.min(
                aOutputMax_.fixedPointMul(aIORatio_)
            );

            require(
                stateChange_.aOutput > 0 || stateChange_.bOutput > 0,
                "0_CLEAR"
            );

            stateChange_.aInput = stateChange_.aOutput.fixedPointMul(aIORatio_);
            stateChange_.bInput = stateChange_.bOutput.fixedPointMul(bIORatio_);
        }

<<<<<<< HEAD
        if (stateChange_.aOutput > 0) {
            vaults[a_.owner][a_.validOutputs[clearConfig_.aOutputIndex].token][
                a_.validOutputs[clearConfig_.aOutputIndex].vaultId
            ] -= stateChange_.aOutput;
            if (stateChange_.aFlag.get(FLAG_INDEX_CLEARED_ORDER)) {
                clearedOrder[a_.hash()] += stateChange_.aOutput;
            }
            if (stateChange_.aFlag.get(FLAG_INDEX_CLEARED_COUNTERPARTY)) {
                // A counts funds paid to cover the bounty as cleared for B.
                clearedCounterparty[a_.hash()][b_.owner] += stateChange_
                    .aOutput;
            }
        }
        if (stateChange_.bOutput > 0) {
            vaults[b_.owner][b_.validOutputs[clearConfig_.bOutputIndex].token][
                b_.validOutputs[clearConfig_.bOutputIndex].vaultId
            ] -= stateChange_.bOutput;
            if (stateChange_.bFlag.get(FLAG_INDEX_CLEARED_ORDER)) {
                clearedOrder[b_.hash()] += stateChange_.bOutput;
            }
            if (stateChange_.bFlag.get(FLAG_INDEX_CLEARED_COUNTERPARTY)) {
                clearedCounterparty[b_.hash()][a_.owner] += stateChange_
                    .bOutput;
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
=======
        _recordVaultIO(
            a_,
            b_.owner,
            clearConfig_.aInputIOIndex,
            stateChange_.aInput,
            clearConfig_.aOutputIOIndex,
            stateChange_.aOutput
        );
        _recordVaultIO(
            b_,
            a_.owner,
            clearConfig_.bInputIOIndex,
            stateChange_.bInput,
            clearConfig_.bOutputIOIndex,
            stateChange_.bOutput
        );

>>>>>>> develop
        {
            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            uint256 aBounty_ = stateChange_.aOutput - stateChange_.bInput;
            uint256 bBounty_ = stateChange_.bOutput - stateChange_.aInput;
            if (aBounty_ > 0) {
                vaults[msg.sender][
                    a_.validOutputs[clearConfig_.aOutputIOIndex].token
                ][clearConfig_.aBountyVaultId] += aBounty_;
            }
            if (bBounty_ > 0) {
                vaults[msg.sender][
                    b_.validOutputs[clearConfig_.bOutputIOIndex].token
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
