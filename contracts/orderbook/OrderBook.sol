// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IOrderBookV1.sol";
import "../interpreter/run/LibStackPointer.sol";
import "../math/FixedPointMath.sol";
import "../interpreter/ops/AllStandardOps.sol";
import "./OrderBookFlashLender.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibContext.sol";
import "../interpreter/run/IInterpreterCallerV1.sol";

import {MulticallUpgradeable as Multicall} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

SourceIndex constant ORDER_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant HANDLE_IO_ENTRYPOINT = SourceIndex.wrap(1);

uint256 constant ORDER_MIN_OUTPUTS = 2;
uint256 constant ORDER_MAX_OUTPUTS = 2;

uint256 constant HANDLE_IO_MIN_OUTPUTS = 0;
uint256 constant HANDLE_IO_MAX_OUTPUTS = type(uint16).max;

uint256 constant CONTEXT_COLUMNS = 4;
uint256 constant CONTEXT_BASE_COLUMN = 0;
uint256 constant CONTEXT_CALCULATIONS_COLUMN = 1;
uint256 constant CONTEXT_VAULT_INPUTS_COLUMN = 2;
uint256 constant CONTEXT_VAULT_OUTPUTS_COLUMN = 3;

uint256 constant CONTEXT_VAULT_IO_TOKEN = 0;
uint256 constant CONTEXT_VAULT_IO_TOKEN_DECIMALS = 1;
uint256 constant CONTEXT_VAULT_IO_VAULT_ID = 2;
uint256 constant CONTEXT_VAULT_IO_BALANCE_BEFORE = 3;
uint256 constant CONTEXT_VAULT_IO_BALANCE_DIFF = 4;
uint256 constant CONTEXT_VAULT_IO_ROWS = 5;

struct ClearStateChange {
    uint256 aOutput;
    uint256 bOutput;
    uint256 aInput;
    uint256 bInput;
}

struct OrderIOCalculation {
    // `a_` and `b_` can both set a maximum output from the Interpreter.
    uint256 outputMax;
    // `IORatio` is input per output
    uint256 IORatio;
    uint256[][] context;
    IInterpreterStoreV1 store;
    StateNamespace namespace;
    uint256[] kvs;
}

library LibOrder {
    function hash(Order memory order_) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(order_)));
    }
}

contract OrderBook is
    IOrderBookV1,
    ReentrancyGuard,
    Multicall,
    OrderBookFlashLender,
    IInterpreterCallerV1
{
    using LibInterpreterState for bytes;
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256[];
    using SafeERC20 for IERC20;
    using Math for uint256;
    using FixedPointMath for uint256;
    using LibOrder for Order;
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256;

    event Deposit(address sender, DepositConfig config);
    /// @param sender `msg.sender` withdrawing tokens.
    /// @param config All config sent to the `withdraw` call.
    /// @param amount The amount of tokens withdrawn, can be less than the
    /// config amount if the vault does not have the funds available to cover
    /// the config amount.
    event Withdraw(address sender, WithdrawConfig config, uint256 amount);
    event AddOrder(address sender, Order order, uint256 orderHash);
    event RemoveOrder(address sender, Order order, uint256 orderHash);
    event TakeOrder(
        address sender,
        TakeOrderConfig takeOrder,
        uint256 input,
        uint256 output
    );
    event OrderNotFound(address sender, address owner, uint256 orderHash);
    event OrderZeroAmount(address sender, address owner, uint256 orderHash);
    event OrderExceedsMaxRatio(
        address sender,
        address owner,
        uint256 orderHash
    );
    event Clear(address sender, Order a, Order b, ClearConfig clearConfig);
    event AfterClear(ClearStateChange clearStateChange);

    // order hash => order is live
    mapping(uint256 => uint256) private orders;
    /// @inheritdoc IOrderBookV1
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public vaultBalance;

    constructor() initializer {
        __ReentrancyGuard_init();
        __Multicall_init();
    }

    function deposit(DepositConfig calldata config_) external nonReentrant {
        vaultBalance[msg.sender][config_.token][config_.vaultId] += config_
            .amount;
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
    function withdraw(WithdrawConfig calldata config_) external nonReentrant {
        uint256 vaultBalance_ = vaultBalance[msg.sender][config_.token][
            config_.vaultId
        ];
        uint256 withdrawAmount_ = config_.amount.min(vaultBalance_);
        vaultBalance[msg.sender][config_.token][config_.vaultId] =
            vaultBalance_ -
            withdrawAmount_;
        emit Withdraw(msg.sender, config_, withdrawAmount_);
        _decreaseFlashDebtThenSendToken(
            config_.token,
            msg.sender,
            withdrawAmount_
        );
    }

    function addOrder(OrderConfig calldata config_) external nonReentrant {
        address expression_ = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.interpreterStateConfig,
                LibUint256Array.arrayFrom(
                    ORDER_MIN_OUTPUTS,
                    HANDLE_IO_MIN_OUTPUTS
                )
            );
        Order memory order_ = Order(
            msg.sender,
            config_.interpreter,
            LibEncodedDispatch.encode(
                expression_,
                ORDER_ENTRYPOINT,
                ORDER_MAX_OUTPUTS
            ),
            config_
                .interpreterStateConfig
                .sources[SourceIndex.unwrap(HANDLE_IO_ENTRYPOINT)]
                .length > 0
                ? LibEncodedDispatch.encode(
                    expression_,
                    HANDLE_IO_ENTRYPOINT,
                    HANDLE_IO_MAX_OUTPUTS
                )
                : EncodedDispatch.wrap(0),
            config_.validInputs,
            config_.validOutputs,
            config_.data
        );
        uint256 orderHash_ = order_.hash();
        orders[orderHash_] = 1;
        emit AddOrder(msg.sender, order_, orderHash_);
    }

    function removeOrder(Order calldata order_) external nonReentrant {
        require(msg.sender == order_.owner, "OWNER");
        uint256 orderHash_ = order_.hash();
        delete (orders[orderHash_]);
        emit RemoveOrder(msg.sender, order_, orderHash_);
    }

    function _calculateOrderIO(
        Order memory order_,
        uint256 inputIOIndex_,
        uint256 outputIOIndex_,
        address counterparty_
    ) internal view returns (OrderIOCalculation memory) {
        uint256 orderHash_ = order_.hash();
        uint256[][] memory context_ = new uint256[][](CONTEXT_COLUMNS);

        {
            context_[CONTEXT_BASE_COLUMN] = LibUint256Array.arrayFrom(
                orderHash_,
                uint256(uint160(order_.owner)),
                uint256(uint160(counterparty_))
            );

            context_[CONTEXT_VAULT_INPUTS_COLUMN] = new uint256[](
                CONTEXT_VAULT_IO_ROWS
            );
            context_[CONTEXT_VAULT_OUTPUTS_COLUMN] = new uint256[](
                CONTEXT_VAULT_IO_ROWS
            );

            context_[CONTEXT_VAULT_INPUTS_COLUMN][
                CONTEXT_VAULT_IO_TOKEN
            ] = uint(uint160(order_.validInputs[inputIOIndex_].token));
            context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                CONTEXT_VAULT_IO_TOKEN
            ] = uint(uint160(order_.validOutputs[outputIOIndex_].token));

            context_[CONTEXT_VAULT_INPUTS_COLUMN][
                CONTEXT_VAULT_IO_TOKEN_DECIMALS
            ] = order_.validInputs[inputIOIndex_].decimals;
            context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                CONTEXT_VAULT_IO_TOKEN_DECIMALS
            ] = order_.validOutputs[outputIOIndex_].decimals;

            context_[CONTEXT_VAULT_INPUTS_COLUMN][
                CONTEXT_VAULT_IO_VAULT_ID
            ] = order_.validInputs[inputIOIndex_].vaultId;
            context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                CONTEXT_VAULT_IO_VAULT_ID
            ] = order_.validOutputs[outputIOIndex_].vaultId;

            context_[CONTEXT_VAULT_INPUTS_COLUMN][
                CONTEXT_VAULT_IO_BALANCE_BEFORE
            ] = vaultBalance[order_.owner][
                order_.validInputs[inputIOIndex_].token
            ][order_.validInputs[inputIOIndex_].vaultId];
            context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                CONTEXT_VAULT_IO_BALANCE_BEFORE
            ] = vaultBalance[order_.owner][
                order_.validOutputs[outputIOIndex_].token
            ][order_.validOutputs[outputIOIndex_].vaultId];
        }

        // The state changes produced here are handled in _recordVaultIO so that
        // local storage writes happen before writes on the interpreter.
        StateNamespace namespace_ = StateNamespace.wrap(
            uint(uint160(order_.owner))
        );
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = IInterpreterV1(order_.interpreter).eval(
                namespace_,
                order_.dispatch,
                context_
            );
        (uint256 orderOutputMax_, uint256 orderIORatio_) = stack_
            .asStackPointerAfter()
            .peek2();

        // Rescale order output max from 18 FP to whatever decimals the output
        // token is using.
        orderOutputMax_ = orderOutputMax_.scaleN(
            order_.validOutputs[outputIOIndex_].decimals
        );
        // Rescale the ratio from 18 FP according to the difference in decimals
        // between input and output.
        orderIORatio_ = orderIORatio_.scaleRatio(
            order_.validOutputs[outputIOIndex_].decimals,
            order_.validInputs[inputIOIndex_].decimals
        );

        {
            uint256[] memory calculationsContext_ = new uint256[](2);
            calculationsContext_[0] = orderOutputMax_;
            calculationsContext_[1] = orderIORatio_;
            context_[CONTEXT_CALCULATIONS_COLUMN] = calculationsContext_;
        }

        // The order owner can't send more than the smaller of their vault
        // balance or their per-order limit.
        orderOutputMax_ = orderOutputMax_.min(
            vaultBalance[order_.owner][
                order_.validOutputs[outputIOIndex_].token
            ][order_.validOutputs[outputIOIndex_].vaultId]
        );

        return
            OrderIOCalculation(
                orderOutputMax_,
                orderIORatio_,
                context_,
                store_,
                namespace_,
                kvs_
            );
    }

    function _recordVaultIO(
        Order memory order_,
        uint256 input_,
        uint256 output_,
        uint256[][] memory context_,
        IInterpreterStoreV1 calculateStore_,
        StateNamespace namespace_,
        uint256[] memory calculateKVs_
    ) internal {
        context_[CONTEXT_VAULT_INPUTS_COLUMN][
            CONTEXT_VAULT_IO_BALANCE_DIFF
        ] = input_;
        context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
            CONTEXT_VAULT_IO_BALANCE_DIFF
        ] = output_;

        if (input_ > 0) {
            // IMPORTANT! THIS MATH MUST BE CHECKED TO AVOID OVERFLOW.
            vaultBalance[order_.owner][
                address(
                    uint160(
                        context_[CONTEXT_VAULT_INPUTS_COLUMN][
                            CONTEXT_VAULT_IO_TOKEN
                        ]
                    )
                )
            ][
                context_[CONTEXT_VAULT_INPUTS_COLUMN][CONTEXT_VAULT_IO_VAULT_ID]
            ] += input_;
        }
        if (output_ > 0) {
            // IMPORTANT! THIS MATH MUST BE CHECKED TO AVOID UNDERFLOW.
            vaultBalance[order_.owner][
                address(
                    uint160(
                        context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                            CONTEXT_VAULT_IO_TOKEN
                        ]
                    )
                )
            ][
                context_[CONTEXT_VAULT_OUTPUTS_COLUMN][
                    CONTEXT_VAULT_IO_VAULT_ID
                ]
            ] -= output_;
        }

        if (calculateKVs_.length > 0) {
            calculateStore_.set(namespace_, calculateKVs_);
        }
        if (EncodedDispatch.unwrap(order_.handleIODispatch) > 0) {
            emit Context(msg.sender, context_);
            (
                ,
                IInterpreterStoreV1 handleIOStore_,
                uint256[] memory handleIOKVs_
            ) = IInterpreterV1(order_.interpreter).eval(
                    namespace_,
                    order_.handleIODispatch,
                    context_
                );
            if (handleIOKVs_.length > 0) {
                handleIOStore_.set(namespace_, handleIOKVs_);
            }
        }
    }

    function takeOrders(
        TakeOrdersConfig calldata takeOrders_
    )
        external
        nonReentrant
        returns (uint256 totalInput_, uint256 totalOutput_)
    {
        uint256 i_ = 0;
        TakeOrderConfig memory takeOrder_;
        Order memory order_;
        uint256 remainingInput_ = takeOrders_.maximumInput;
        while (i_ < takeOrders_.orders.length && remainingInput_ > 0) {
            takeOrder_ = takeOrders_.orders[i_];
            order_ = takeOrder_.order;
            uint256 orderHash_ = order_.hash();
            if (orders[orderHash_] == 0) {
                emit OrderNotFound(msg.sender, order_.owner, orderHash_);
            } else {
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

                OrderIOCalculation
                    memory orderIOCalculation_ = _calculateOrderIO(
                        order_,
                        takeOrder_.inputIOIndex,
                        takeOrder_.outputIOIndex,
                        msg.sender
                    );

                // Skip orders that are too expensive rather than revert as we have
                // no way of knowing if a specific order becomes too expensive
                // between submitting to mempool and execution, but other orders may
                // be valid so we want to take advantage of those if possible.
                if (orderIOCalculation_.IORatio > takeOrders_.maximumIORatio) {
                    emit OrderExceedsMaxRatio(
                        msg.sender,
                        order_.owner,
                        orderHash_
                    );
                } else if (orderIOCalculation_.outputMax == 0) {
                    emit OrderZeroAmount(msg.sender, order_.owner, orderHash_);
                } else {
                    uint256 input_ = remainingInput_.min(
                        orderIOCalculation_.outputMax
                    );
                    uint256 output_ = input_.fixedPointMul(
                        orderIOCalculation_.IORatio
                    );

                    remainingInput_ -= input_;
                    totalOutput_ += output_;

                    _recordVaultIO(
                        order_,
                        output_,
                        input_,
                        orderIOCalculation_.context,
                        orderIOCalculation_.store,
                        orderIOCalculation_.namespace,
                        orderIOCalculation_.kvs
                    );
                    emit TakeOrder(msg.sender, takeOrder_, input_, output_);
                }
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
        _decreaseFlashDebtThenSendToken(
            takeOrders_.input,
            msg.sender,
            totalInput_
        );
    }

    function clear(
        Order memory a_,
        Order memory b_,
        ClearConfig calldata clearConfig_
    ) external nonReentrant {
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
            require(orders[a_.hash()] > 0, "A_NOT_LIVE");
            require(orders[b_.hash()] > 0, "B_NOT_LIVE");

            // emit the Clear event before `a_` and `b_` are mutated due to the
            // Interpreter execution in eval.
            emit Clear(msg.sender, a_, b_, clearConfig_);
        }
        OrderIOCalculation memory aOrderIOCalculation_;
        OrderIOCalculation memory bOrderIOCalculation_;
        ClearStateChange memory clearStateChange_;
        {
            aOrderIOCalculation_ = _calculateOrderIO(
                a_,
                clearConfig_.aInputIOIndex,
                clearConfig_.aOutputIOIndex,
                b_.owner
            );
            bOrderIOCalculation_ = _calculateOrderIO(
                b_,
                clearConfig_.bInputIOIndex,
                clearConfig_.bOutputIOIndex,
                a_.owner
            );

            clearStateChange_.aOutput = aOrderIOCalculation_.outputMax.min(
                bOrderIOCalculation_.outputMax.fixedPointMul(
                    bOrderIOCalculation_.IORatio
                )
            );
            clearStateChange_.bOutput = bOrderIOCalculation_.outputMax.min(
                aOrderIOCalculation_.outputMax.fixedPointMul(
                    aOrderIOCalculation_.IORatio
                )
            );

            require(
                clearStateChange_.aOutput > 0 || clearStateChange_.bOutput > 0,
                "0_CLEAR"
            );

            clearStateChange_.aInput = clearStateChange_.aOutput.fixedPointMul(
                aOrderIOCalculation_.IORatio
            );
            clearStateChange_.bInput = clearStateChange_.bOutput.fixedPointMul(
                bOrderIOCalculation_.IORatio
            );
        }

        _recordVaultIO(
            a_,
            clearStateChange_.aInput,
            clearStateChange_.aOutput,
            aOrderIOCalculation_.context,
            aOrderIOCalculation_.store,
            aOrderIOCalculation_.namespace,
            aOrderIOCalculation_.kvs
        );
        _recordVaultIO(
            b_,
            clearStateChange_.bInput,
            clearStateChange_.bOutput,
            bOrderIOCalculation_.context,
            bOrderIOCalculation_.store,
            bOrderIOCalculation_.namespace,
            bOrderIOCalculation_.kvs
        );

        {
            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            uint256 aBounty_ = clearStateChange_.aOutput -
                clearStateChange_.bInput;
            uint256 bBounty_ = clearStateChange_.bOutput -
                clearStateChange_.aInput;
            if (aBounty_ > 0) {
                vaultBalance[msg.sender][
                    a_.validOutputs[clearConfig_.aOutputIOIndex].token
                ][clearConfig_.aBountyVaultId] += aBounty_;
            }
            if (bBounty_ > 0) {
                vaultBalance[msg.sender][
                    b_.validOutputs[clearConfig_.bOutputIOIndex].token
                ][clearConfig_.bBountyVaultId] += bBounty_;
            }
        }

        emit AfterClear(clearStateChange_);
    }
}
