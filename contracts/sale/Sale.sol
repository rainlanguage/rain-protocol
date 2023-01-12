// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Cooldown} from "../cooldown/Cooldown.sol";

import "../math/FixedPointMath.sol";
import {AllStandardOps} from "../interpreter/ops/AllStandardOps.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import "./ISaleV2.sol";
import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../sstore2/SSTORE2.sol";
import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/IInterpreterV1.sol";
import "../interpreter/run/LibStackPointer.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibContext.sol";
import "../interpreter/run/IInterpreterCallerV1.sol";

/// Everything required to construct a Sale (not initialize).
/// @param maximumSaleTimeout The sale timeout set in initialize cannot exceed
/// this. Avoids downstream escrows and similar trapping funds due to sales
/// that never end, or perhaps never even start.
/// @param maximumCooldownDuration The cooldown duration set in initialize
/// cannot exceed this. Avoids the "no refunds" situation where someone sets an
/// infinite cooldown, then accidentally or maliciously the sale ends up in a
/// state where it cannot end (bad "can end" expression), leading to trapped
/// funds.
/// @param redeemableERC20Factory The factory contract that creates redeemable
/// erc20 tokens that the `Sale` can mint, sell and burn.
struct SaleConstructorConfig {
    uint256 maximumSaleTimeout;
    RedeemableERC20Factory redeemableERC20Factory;
}

/// Everything required to configure (initialize) a Sale.
/// @param canStartStateConfig State config for the expression that allows a
/// `Sale` to start.
/// @param canEndStateConfig State config for the expression that allows a
/// `Sale` to end. IMPORTANT: A Sale can always end if/when its rTKN sells out,
/// regardless of the result of this expression.
/// @param calculatePriceStateConfig State config for the expression that defines
/// the current price quoted by a Sale.
/// @param recipient The recipient of the proceeds of a Sale, if/when the Sale
/// is successful.
/// @param reserve The reserve token the Sale is deonominated in.
/// @param saleTimeout The number of seconds before this sale can timeout.
/// SHOULD be well after the expected end time as a timeout will fail an active
/// or pending sale regardless of any funds raised.
/// @param cooldownDuration forwarded to `Cooldown` contract initialization.
/// @param minimumRaise defines the amount of reserve required to raise that
/// defines success/fail of the sale. Reaching the minimum raise DOES NOT cause
/// the raise to end early (unless the "can end" expression allows it of course).
/// @param dustSize The minimum amount of rTKN that must remain in the Sale
/// contract unless it is all purchased, clearing the raise to 0 stock and thus
/// ending the raise.
struct SaleConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig interpreterStateConfig;
    address recipient;
    address reserve;
    uint256 saleTimeout;
    uint256 cooldownDuration;
    uint256 minimumRaise;
    uint256 dustSize;
}

/// Forwarded config to RedeemableERC20 initialization.
struct SaleRedeemableERC20Config {
    ERC20Config erc20Config;
    address tier;
    uint256 minimumTier;
    address distributionEndForwardingAddress;
}

/// Defines a request to buy rTKN from an active sale.
/// @param feeRecipient Optional recipient to send fees to. Intended to be a
/// "tip" for the front-end client that the buyer is using to fund development,
/// infrastructure, etc.
/// @param fee Size of the optional fee to send to the recipient. Denominated
/// in the reserve token of the `Sale` contract.
/// @param minimumUnits The minimum size of the buy. If the sale is close to
/// selling out then the buyer may not fulfill their entire order, so this sets
/// the minimum units the buyer is willing to accept for their order. MAY be 0
/// if the buyer is willing to accept any amount of tokens.
/// @param desiredUnits The maximum and desired size of the buy. The sale will
/// always attempt to fulfill the buy order to the maximum rTKN amount possible
/// according to the unsold stock on hand. Typically all the desired units will
/// clear but as the sale runs low on stock it may not be able to.
/// @param maximumPrice As the price quoted by the sale is a programmable curve
/// it may change rapidly between when the buyer submitted a transaction to the
/// mempool and when it is mined. Setting a maximum price is akin to setting
/// slippage on a traditional AMM. The transaction will revert if the sale
/// price exceeds the buyer's maximum.
struct BuyConfig {
    address feeRecipient;
    uint256 fee;
    uint256 minimumUnits;
    uint256 desiredUnits;
    uint256 maximumPrice;
}

/// Defines the receipt for a successful buy.
/// The receipt includes the final units and price paid for rTKN, which are
/// known as possible ranges in `BuyConfig`.
/// Importantly a receipt allows a buy to be reversed for as long as the sale
/// is active, subject to buyer cooldowns as per `Cooldown`. In the case of a
/// finalized but failed sale, all buyers can immediately process refunds for
/// their receipts without cooldown. As the receipt is crucial to the refund
/// process every receipt is logged so it can be indexed and never lost, and
/// unique IDs bound to the buyer in onchain storage prevent receipts from
/// being used in a fraudulent context. The entire receipt including the id is
/// hashed in the storage mapping that binds it to a buyer so that a buyer
/// cannot change the receipt offchain to claim fraudulent refunds.
/// Front-end fees are also tracked and refunded for each receipt, to prevent
/// front end clients from gaming/abusing sale contracts.
/// @param id Every receipt is assigned a sequential ID to ensure uniqueness
/// across all receipts.
/// @param feeRecipient as per `BuyConfig`.
/// @param fee as per `BuyConfig`.
/// @param units number of rTKN bought and refundable.
/// @param price price paid per unit denominated and refundable in reserve.
struct Receipt {
    uint256 id;
    address feeRecipient;
    uint256 fee;
    uint256 units;
    uint256 price;
}

SourceIndex constant CAN_LIVE_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CALCULATE_BUY_ENTRYPOINT = SourceIndex.wrap(1);
SourceIndex constant HANDLE_BUY_ENTRYPOINT = SourceIndex.wrap(2);

uint256 constant CAN_LIVE_MIN_OUTPUTS = 1;
uint256 constant CAN_LIVE_MAX_OUTPUTS = 1;
uint256 constant CALCULATE_BUY_MIN_OUTPUTS = 2;
uint256 constant CALCULATE_BUY_MAX_OUTPUTS = 2;
uint256 constant HANDLE_BUY_MIN_OUTPUTS = 0;
uint256 constant HANDLE_BUY_MAX_OUTPUTS = 0;

uint256 constant CONTEXT_COLUMNS = 2;
uint256 constant CONTEXT_CALCULATIONS_COLUMN = 1;
uint256 constant CONTEXT_BUY_COLUMN = 2;

uint256 constant CONTEXT_BUY_TOKEN_OUT_ROW = 0;
uint256 constant CONTEXT_BUY_TOKEN_BALANCE_BEFORE_ROW = 1;
uint256 constant CONTEXT_BUY_TOKEN_BALANCE_AFTER_ROW = 2;
uint256 constant CONTEXT_BUY_RESERVE_FEE_ROW = 3;
uint256 constant CONTEXT_BUY_RESERVE_COST_ROW = 4;
uint256 constant CONTEXT_BUY_RESERVE_BALANCE_BEFORE_ROW = 5;
uint256 constant CONTEXT_BUY_RESERVE_BALANCE_AFTER_ROW = 6;
uint256 constant CONTEXT_BUY_ROWS = 7;

// solhint-disable-next-line max-states-count
contract Sale is Cooldown, ISaleV2, ReentrancyGuard, IInterpreterCallerV1 {
    using Math for uint256;
    using FixedPointMath for uint256;
    using SafeERC20 for IERC20;
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    /// Contract is constructing.
    /// @param sender `msg.sender` of the contract deployer.
    event Construct(address sender, SaleConstructorConfig config);
    /// Contract is initializing (being cloned by factory).
    /// @param sender `msg.sender` of the contract initializer (cloner).
    /// @param config All initialization config passed by the sender.
    /// @param token The freshly deployed and minted rTKN for the sale.
    event Initialize(address sender, SaleConfig config, address token);
    /// Sale is started (moved to active sale state).
    /// @param sender `msg.sender` that started the sale.
    event Start(address sender);
    /// Sale has ended (moved to success/fail sale state).
    /// @param sender `msg.sender` that ended the sale.
    /// @param saleStatus The final success/fail state of the sale.
    event End(address sender, SaleStatus saleStatus);
    /// Sale has failed due to a timeout (failed to even start/end).
    /// @param sender `msg.sender` that timed out the sale.
    event Timeout(address sender);
    /// rTKN being bought.
    /// Importantly includes the receipt that sender can use to apply for a
    /// refund later if they wish.
    /// @param sender `msg.sender` buying rTKN.
    /// @param config All buy config passed by the sender.
    /// @param receipt The purchase receipt, can be used to claim refunds.
    event Buy(address sender, BuyConfig config, Receipt receipt);
    /// rTKN being refunded.
    /// Includes the receipt used to justify the refund.
    event Refund(address sender, Receipt receipt);

    /// @dev the saleTimeout cannot exceed this. Prevents downstream contracts
    /// that require a finalization such as escrows from getting permanently
    /// stuck in a pending or active status due to buggy expressions.
    uint256 private immutable maximumSaleTimeout;

    EncodedDispatch internal dispatchCanLive;
    EncodedDispatch internal dispatchCalculateBuy;
    EncodedDispatch internal dispatchHandleBuy;
    IInterpreterV1 private interpreter;

    /// @inheritdoc ISaleV2
    uint256 public remainingTokenInventory;

    /// @inheritdoc ISaleV2
    uint256 public totalReserveReceived;

    /// @inheritdoc ISaleV2
    address public token;

    /// @inheritdoc ISaleV2
    address public reserve;

    /// @inheritdoc ISaleV2
    SaleStatus public saleStatus;

    /// Factory responsible for minting rTKN.
    RedeemableERC20Factory private immutable redeemableERC20Factory;

    /// @dev as per `SaleConfig`.
    address private recipient;
    /// @dev as per `SaleConfig`.
    uint256 private minimumRaise;
    /// @dev as per `SaleConfig`.
    uint256 private dustSize;

    /// @dev the current sale can always end in failure at this time even if
    /// it did not start. Provided it did not already end of course.
    uint256 private saleTimeoutStamp;

    /// @dev Binding buyers to receipt hashes to maybe a non-zero value.
    /// A receipt will only be honoured if the mapping resolves to non-zero.
    /// The receipt hashing ensures that receipts cannot be manipulated before
    /// redemption. Each mapping is deleted if/when receipt is used for refund.
    /// Buyer => keccak receipt => exists (1+ or 0).
    mapping(address => mapping(bytes32 => uint256)) private receipts;
    /// @dev simple incremental counter to keep all receipts unique so that
    /// receipt hashes bound to buyers never collide.
    uint256 private nextReceiptId;

    /// @dev Tracks combined fees per recipient to be claimed if/when a sale
    /// is successful.
    /// Fee recipient => unclaimed fees.
    mapping(address => uint256) private fees;

    constructor(SaleConstructorConfig memory config_) {
        _disableInitializers();

        maximumSaleTimeout = config_.maximumSaleTimeout;

        redeemableERC20Factory = config_.redeemableERC20Factory;

        emit Construct(msg.sender, config_);
    }

    function initialize(
        SaleConfig calldata config_,
        SaleRedeemableERC20Config memory saleRedeemableERC20Config_
    ) external initializer {
        __ReentrancyGuard_init();
        initializeCooldown(config_.cooldownDuration);

        require(config_.saleTimeout <= maximumSaleTimeout, "MAX_TIMEOUT");
        saleTimeoutStamp = block.timestamp + config_.saleTimeout;

        // 0 minimum raise is ambiguous as to how it should be handled. It
        // literally means "the raise succeeds without any trades", which
        // doesn't have a clear way to move funds around as there are no
        // recipients of potentially escrowed or redeemable funds. There needs
        // to be at least 1 reserve token paid from 1 buyer in order to
        // meaningfully process success logic.
        require(config_.minimumRaise > 0, "MIN_RAISE_0");
        minimumRaise = config_.minimumRaise;

        address expression_ = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.interpreterStateConfig,
                LibUint256Array.arrayFrom(
                    CAN_LIVE_MIN_OUTPUTS,
                    CALCULATE_BUY_MIN_OUTPUTS,
                    HANDLE_BUY_MIN_OUTPUTS
                )
            );
        dispatchCanLive = LibEncodedDispatch.encode(
            expression_,
            CAN_LIVE_ENTRYPOINT,
            CAN_LIVE_MAX_OUTPUTS
        );
        dispatchCalculateBuy = LibEncodedDispatch.encode(
            expression_,
            CALCULATE_BUY_ENTRYPOINT,
            CALCULATE_BUY_MAX_OUTPUTS
        );
        if (
            config_
                .interpreterStateConfig
                .sources[SourceIndex.unwrap(HANDLE_BUY_ENTRYPOINT)]
                .length > 0
        ) {
            dispatchHandleBuy = LibEncodedDispatch.encode(
                expression_,
                HANDLE_BUY_ENTRYPOINT,
                HANDLE_BUY_MAX_OUTPUTS
            );
        }
        interpreter = IInterpreterV1(config_.interpreter);

        recipient = config_.recipient;

        dustSize = config_.dustSize;

        // just making this explicit during initialization in case it ever
        // takes a nonzero value somehow due to refactor.
        saleStatus = SaleStatus.Pending;

        reserve = config_.reserve;

        // The distributor of the rTKN is always set to the sale contract.
        // It is an error for the deployer to attempt to set the distributor.
        require(
            saleRedeemableERC20Config_.erc20Config.distributor == address(0),
            "DISTRIBUTOR_SET"
        );
        saleRedeemableERC20Config_.erc20Config.distributor = address(this);

        remainingTokenInventory = saleRedeemableERC20Config_
            .erc20Config
            .initialSupply;

        address token_ = redeemableERC20Factory.createChild(
            abi.encode(
                RedeemableERC20Config(
                    address(config_.reserve),
                    saleRedeemableERC20Config_.erc20Config,
                    saleRedeemableERC20Config_.tier,
                    saleRedeemableERC20Config_.minimumTier,
                    saleRedeemableERC20Config_.distributionEndForwardingAddress
                )
            )
        );
        token = token_;

        emit Initialize(msg.sender, config_, address(token_));
    }

    /// Can the Sale live?
    /// Evals the "can live" expression.
    /// If a non zero value is returned then the sale can move from pending to
    /// active, or remain active.
    /// If a zero value is returned the sale can remain pending or move from
    /// active to a finalised status.
    /// An out of stock (0 remaining units) WILL ALWAYS return `false` without
    /// evaluating the expression.
    function _previewCanLive()
        internal
        view
        returns (bool, IInterpreterStoreV1, uint256[] memory)
    {
        unchecked {
            if (remainingTokenInventory < 1) {
                return (
                    false,
                    IInterpreterStoreV1(address(0)),
                    new uint256[](0)
                );
            }
            (
                uint256[] memory stack_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = interpreter.eval(
                    DEFAULT_STATE_NAMESPACE,
                    dispatchCanLive,
                    LibContext.build(
                        new uint256[][](0),
                        new uint256[](0),
                        new SignedContext[](0)
                    )
                );
            return (stack_[stack_.length - 1] > 0, store_, kvs_);
        }
    }

    function _start() internal {
        saleStatus = SaleStatus.Active;
        emit Start(msg.sender);
    }

    function _end() internal {
        bool success_ = totalReserveReceived >= minimumRaise;
        SaleStatus endStatus_ = success_ ? SaleStatus.Success : SaleStatus.Fail;

        remainingTokenInventory = 0;
        saleStatus = endStatus_;
        emit End(msg.sender, endStatus_);
        RedeemableERC20(token).endDistribution(address(this));

        // Only send reserve to recipient if the raise is a success.
        // If the raise is NOT a success then everyone can refund their reserve
        // deposited individually.
        if (success_) {
            IERC20(reserve).safeTransfer(recipient, totalReserveReceived);
        }
    }

    /// External view into whether the sale can currently be active.
    /// Offchain users MAY call this directly or calculate the outcome
    /// themselves.
    function previewCanLive() external view returns (bool) {
        (bool canLive_, , ) = _previewCanLive();
        return canLive_;
    }

    function _previewCalculateBuy(
        uint256 targetUnits_
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256[][] memory,
            IInterpreterStoreV1,
            uint256[] memory
        )
    {
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](CONTEXT_COLUMNS),
            targetUnits_.arrayFrom(),
            new SignedContext[](0)
        );
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = interpreter.eval(
                DEFAULT_STATE_NAMESPACE,
                dispatchCalculateBuy,
                context_
            );
        (uint256 amount_, uint256 ratio_) = stack_
            .asStackPointerAfter()
            .peek2();
        uint256[] memory calculationsContext_ = LibUint256Array.arrayFrom(
            amount_,
            ratio_
        );
        context_[CONTEXT_CALCULATIONS_COLUMN] = calculationsContext_;
        context_[CONTEXT_BUY_COLUMN] = new uint256[](CONTEXT_BUY_ROWS);
        return (amount_, ratio_, context_, store_, kvs_);
    }

    function previewCalculateBuy(
        uint256 targetUnits_
    ) external view returns (uint256, uint256) {
        (uint256 amount_, uint256 ratio_, , , ) = _previewCalculateBuy(
            targetUnits_
        );
        return (amount_, ratio_);
    }

    /// Start the sale (move from pending to active).
    /// This is also done automatically inline with each `buy` call so is
    /// optional for anon to call outside of a purchase.
    /// `canStart` MUST return true.
    function start() external {
        require(saleStatus == SaleStatus.Pending, "NOT_PENDING");
        (
            bool canLive_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = _previewCanLive();
        require(canLive_, "NOT_LIVE");
        if (kvs_.length > 0) {
            store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
        }
        _start();
    }

    /// End the sale (move from active to success or fail).
    /// This is also done automatically inline with each `buy` call so is
    /// optional for anon to call outside of a purchase.
    /// `canEnd` MUST return true.
    function end() external {
        require(saleStatus == SaleStatus.Active, "NOT_ACTIVE");
        (
            bool canLive_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = _previewCanLive();
        require(!canLive_, "LIVE");
        if (kvs_.length > 0) {
            store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
        }
        _end();
    }

    /// Timeout the sale (move from pending or active to fail).
    /// The ONLY condition for a timeout is that the `saleTimeout` block set
    /// during initialize is in the past. This means that regardless of what
    /// happens re: starting, ending, buying, etc. if the sale does NOT manage
    /// to unambiguously end by the timeout block then it can timeout to a fail
    /// state. This means that any downstream escrows or similar can always
    /// expect that eventually they will see a pass/fail state and so are safe
    /// to lock funds while a Sale is active.
    function timeout() external {
        require(saleTimeoutStamp < block.timestamp, "EARLY_TIMEOUT");
        require(
            saleStatus == SaleStatus.Pending || saleStatus == SaleStatus.Active,
            "ALREADY_ENDED"
        );

        // Mimic `end` with a failed state but `Timeout` event.
        remainingTokenInventory = 0;
        saleStatus = SaleStatus.Fail;
        emit Timeout(msg.sender);
        RedeemableERC20(token).endDistribution(address(this));
    }

    /// Main entrypoint to the sale. Sells rTKN in exchange for reserve token.
    /// The price curve is eval'd to produce a reserve price quote. Each 1 unit
    /// of rTKN costs `price` reserve token where BOTH the rTKN units and price
    /// are treated as 18 decimal fixed point values. If the reserve token has
    /// more or less precision by its own conventions (e.g. "decimals" method
    /// on ERC20 tokens) then the price will need to scale accordingly.
    /// The receipt is _logged_ rather than returned as it cannot be used in
    /// same block for a refund anyway due to cooldowns.
    /// @param config_ All parameters to configure the purchase.
    function buy(
        BuyConfig memory config_
    ) external onlyAfterCooldown nonReentrant {
        require(0 < config_.minimumUnits, "0_MINIMUM");
        require(
            config_.minimumUnits <= config_.desiredUnits,
            "MINIMUM_OVER_DESIRED"
        );
        IInterpreterV1 interpreter_ = interpreter;

        {
            // Start or end the sale as required.
            (
                bool canLive0_,
                IInterpreterStoreV1 canLive0Store_,
                uint256[] memory canLive0KVs_
            ) = _previewCanLive();
            // Register state changes with intepreter _before_ potentially ending and
            // returning early.
            if (canLive0KVs_.length > 0) {
                canLive0Store_.set(DEFAULT_STATE_NAMESPACE, canLive0KVs_);
            }
            if (canLive0_) {
                if (saleStatus == SaleStatus.Pending) {
                    _start();
                }
            } else {
                if (saleStatus == SaleStatus.Active) {
                    _end();
                    // Return early so that the state change of active to ended can
                    // take effect. Otherwise it will rollback as "NOT_ACTIVE" below
                    // leaving the sale active even though it should have ended here.
                    return;
                }
            }

            // Check the status AFTER possibly modifying it to ensure the potential
            // modification is respected.
            require(saleStatus == SaleStatus.Active, "NOT_ACTIVE");
        }

        uint256 targetUnits_ = config_.desiredUnits.min(
            remainingTokenInventory
        );

        uint256 maxUnits_;
        uint256 price_;
        uint256[][] memory context_;
        {
            uint256[] memory calculateBuyKVs_;
            IInterpreterStoreV1 calculateBuyStore_;
            (
                maxUnits_,
                price_,
                context_,
                calculateBuyStore_,
                calculateBuyKVs_
            ) = _previewCalculateBuy(targetUnits_);
            if (calculateBuyKVs_.length > 0) {
                calculateBuyStore_.set(
                    DEFAULT_STATE_NAMESPACE,
                    calculateBuyKVs_
                );
            }
        }

        // The expression may return a larger max units than the target so we
        // have to cap it to prevent the sale selling more than requested.
        // Expressions SHOULD NOT exceed the target units as it may be confusing
        // to end users but it MUST be safe from the sale's perspective to do so.
        // Expressions MAY return max units lower than the target units to
        // enforce per-user or other purchase limits.
        uint256 units_ = maxUnits_.min(targetUnits_);
        require(units_ >= config_.minimumUnits, "INSUFFICIENT_STOCK");

        require(price_ <= config_.maximumPrice, "MAXIMUM_PRICE");
        uint256 cost_ = price_.fixedPointMul(units_);

        Receipt memory receipt_ = Receipt(
            nextReceiptId,
            config_.feeRecipient,
            config_.fee,
            units_,
            price_
        );

        // Slap a code block here to avoid stack limits.
        {
            nextReceiptId++;
            // There should never be more than one of the same key due to the ID
            // counter but we can use checked math to easily cover the case of
            // potential duplicate receipts due to some bug.
            receipts[msg.sender][keccak256(abi.encode(receipt_))]++;

            fees[config_.feeRecipient] += config_.fee;

            // We ignore any rTKN or reserve that is sent to the contract directly
            // outside of a `buy` call. This also means we don't support reserve
            // tokens with balances that can change outside of transfers
            // (e.g. rebase).
            context_[CONTEXT_BUY_COLUMN][CONTEXT_BUY_TOKEN_OUT_ROW] = units_;
            context_[CONTEXT_BUY_COLUMN][
                CONTEXT_BUY_TOKEN_BALANCE_BEFORE_ROW
            ] = remainingTokenInventory;
            // IMPORTANT MUST BE CHECKED MATH TO AVOID UNDERFLOW.
            context_[CONTEXT_BUY_COLUMN][CONTEXT_BUY_TOKEN_BALANCE_AFTER_ROW] =
                context_[CONTEXT_BUY_COLUMN][
                    CONTEXT_BUY_TOKEN_BALANCE_BEFORE_ROW
                ] -
                units_;
            remainingTokenInventory = context_[CONTEXT_BUY_COLUMN][
                CONTEXT_BUY_TOKEN_BALANCE_AFTER_ROW
            ];

            context_[CONTEXT_BUY_COLUMN][CONTEXT_BUY_RESERVE_FEE_ROW] = config_
                .fee;
            context_[CONTEXT_BUY_COLUMN][CONTEXT_BUY_RESERVE_COST_ROW] = cost_;
            context_[CONTEXT_BUY_COLUMN][
                CONTEXT_BUY_RESERVE_BALANCE_BEFORE_ROW
            ] = totalReserveReceived;
            // IMPORTANT MUST BE CHECKED MATH TO AVOID OVERFLOW.
            context_[CONTEXT_BUY_COLUMN][
                CONTEXT_BUY_RESERVE_BALANCE_AFTER_ROW
            ] =
                context_[CONTEXT_BUY_COLUMN][
                    CONTEXT_BUY_RESERVE_BALANCE_BEFORE_ROW
                ] +
                cost_;
            totalReserveReceived += context_[CONTEXT_BUY_COLUMN][
                CONTEXT_BUY_RESERVE_BALANCE_AFTER_ROW
            ];

            EncodedDispatch dispatchHandleBuy_ = dispatchHandleBuy;
            if (EncodedDispatch.unwrap(dispatchHandleBuy_) > 0) {
                emit Context(msg.sender, context_);
                (
                    ,
                    IInterpreterStoreV1 handleBuyStore_,
                    uint256[] memory handleBuyKVs_
                ) = interpreter_.eval(
                        DEFAULT_STATE_NAMESPACE,
                        dispatchHandleBuy_,
                        context_
                    );
                if (handleBuyKVs_.length > 0) {
                    handleBuyStore_.set(DEFAULT_STATE_NAMESPACE, handleBuyKVs_);
                }
            }
        }

        // This happens before `end` so that the transfer from happens before
        // the transfer to.
        // `end` changes state so `buy` needs to be nonReentrant.
        IERC20(reserve).safeTransferFrom(
            msg.sender,
            address(this),
            cost_ + config_.fee
        );
        // This happens before `end` so that the transfer happens before the
        // distributor is burned and token is frozen.
        IERC20(token).safeTransfer(msg.sender, units_);

        emit Buy(msg.sender, config_, receipt_);

        // Enforce the status of the sale after the purchase.
        // The sale ending AFTER the purchase does NOT rollback the purchase,
        // it simply prevents further purchases.
        (
            bool canLive1_,
            IInterpreterStoreV1 canLive1Store_,
            uint256[] memory canLive1KVs_
        ) = _previewCanLive();
        if (canLive1KVs_.length > 0) {
            canLive1Store_.set(DEFAULT_STATE_NAMESPACE, canLive1KVs_);
        }
        if (canLive1_) {
            // This prevents the sale from being left with so little stock that
            // nobody else will want to clear it out. E.g. the dust might be
            // worth significantly less than the price of gas to call `buy`.
            require(remainingTokenInventory >= dustSize, "DUST");
        } else {
            _end();
        }
    }

    /// @dev This is here so we can use a modifier like a function call.
    function refundCooldown() private onlyAfterCooldown {}

    /// Rollback a buy given its receipt.
    /// Ignoring gas (which cannot be refunded) the refund process rolls back
    /// all state changes caused by a buy, other than the receipt id increment.
    /// Refunds are limited by the global cooldown to mitigate rapid buy/refund
    /// cycling that could cause volatile price curves or other unwanted side
    /// effects for other sale participants. Cooldowns are bypassed if the sale
    /// ends and is a failure.
    /// @param receipt_ The receipt of the buy to rollback.
    function refund(Receipt calldata receipt_) external {
        require(saleStatus != SaleStatus.Success, "REFUND_SUCCESS");
        // If the sale failed then cooldowns do NOT apply. Everyone should
        // immediately refund all their receipts.
        if (saleStatus != SaleStatus.Fail) {
            refundCooldown();
        }

        // Checked math here will prevent consuming a receipt that doesn't
        // exist or was already refunded as it will underflow.
        receipts[msg.sender][keccak256(abi.encode(receipt_))]--;

        uint256 cost_ = receipt_.price.fixedPointMul(receipt_.units);

        totalReserveReceived -= cost_;
        remainingTokenInventory += receipt_.units;
        fees[receipt_.feeRecipient] -= receipt_.fee;

        emit Refund(msg.sender, receipt_);

        IERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            receipt_.units
        );
        IERC20(reserve).safeTransfer(msg.sender, cost_ + receipt_.fee);
    }

    /// After a sale ends in success all fees collected for a recipient can be
    /// cleared. If the raise is active or fails then fees cannot be claimed as
    /// they are set aside in case of refund. A failed raise implies that all
    /// buyers should immediately refund and zero fees claimed.
    /// @param recipient_ The recipient to claim fees for. Does NOT need to be
    /// the `msg.sender`.
    function claimFees(address recipient_) external {
        require(saleStatus == SaleStatus.Success, "NOT_SUCCESS");
        uint256 amount_ = fees[recipient_];
        if (amount_ > 0) {
            delete fees[recipient_];
            IERC20(reserve).safeTransfer(recipient_, amount_);
        }
    }
}
