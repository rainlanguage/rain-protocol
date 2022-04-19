// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Cooldown} from "../cooldown/Cooldown.sol";

import "../math/FixedPointMath.sol";
import "../vm/RainVM.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import "./ISale.sol";
//solhint-disable-next-line max-line-length
import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
//solhint-disable-next-line max-line-length
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// solhint-disable-next-line max-line-length
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../sstore2/SSTORE2.sol";
import "../vm/VMStateBuilder.sol";

/// Everything required to construct a Sale (not initialize).
/// @param maximumSaleTimeout The sale timeout set in initialize cannot exceed
/// this. Avoids downstream escrows and similar trapping funds due to sales
/// that never end, or perhaps never even start.
/// @param maximumCooldownDuration The cooldown duration set in initialize
/// cannot exceed this. Avoids the "no refunds" situation where someone sets an
/// infinite cooldown, then accidentally or maliciously the sale ends up in a
/// state where it cannot end (bad "can end" script), leading to trapped funds.
/// @param redeemableERC20Factory The factory contract that creates redeemable
/// erc20 tokens that the `Sale` can mint, sell and burn.
struct SaleConstructorConfig {
    uint256 maximumSaleTimeout;
    uint256 maximumCooldownDuration;
    RedeemableERC20Factory redeemableERC20Factory;
    address vmStateBuilder;
}

/// Everything required to configure (initialize) a Sale.
/// @param canStartStateConfig State config for the script that allows a Sale
/// to start.
/// @param canEndStateConfig State config for the script that allows a Sale to
/// end. IMPORTANT: A Sale can always end if/when its rTKN sells out,
/// regardless of the result of this script.
/// @param calculatePriceStateConfig State config for the script that defines
/// the current price quoted by a Sale.
/// @param recipient The recipient of the proceeds of a Sale, if/when the Sale
/// is successful.
/// @param reserve The reserve token the Sale is deonominated in.
/// @param saleTimeout The number of blocks before this sale can timeout.
/// SHOULD be well after the expected end time as a timeout will fail an active
/// or pending sale regardless of any funds raised.
/// @param cooldownDuration forwarded to `Cooldown` contract initialization.
/// @param minimumRaise defines the amount of reserve required to raise that
/// defines success/fail of the sale. Reaching the minimum raise DOES NOT cause
/// the raise to end early (unless the "can end" script allows it of course).
/// @param dustSize The minimum amount of rTKN that must remain in the Sale
/// contract unless it is all purchased, clearing the raise to 0 stock and thus
/// ending the raise.
struct SaleConfig {
    StateConfig vmStateConfig;
    address recipient;
    IERC20 reserve;
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

uint256 constant CAN_START_ENTRYPOINT = 0;
uint256 constant CAN_END_ENTRYPOINT = 1;
uint256 constant CALCULATE_PRICE_ENTRYPOINT = 2;

// solhint-disable-next-line max-states-count
contract Sale is Initializable, Cooldown, RainVM, ISale, ReentrancyGuard {
    using Math for uint256;
    using FixedPointMath for uint256;
    using SafeERC20 for IERC20;

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

    address private immutable self;
    address private immutable vmStateBuilder;

    /// @dev the saleTimeout cannot exceed this. Prevents downstream contracts
    /// that require a finalization such as escrows from getting permanently
    /// stuck in a pending or active status due to buggy scripts.
    uint256 private immutable maximumSaleTimeout;

    /// Factory responsible for minting rTKN.
    RedeemableERC20Factory private immutable redeemableERC20Factory;

    /// Minted rTKN for each sale.
    /// Exposed via. `ISale.token()`.
    RedeemableERC20 private _token;

    /// @dev as per `SaleConfig`.
    address private recipient;
    /// @dev as per `SaleConfig`.
    address private vmStatePointer;
    /// @dev as per `SaleConfig`.
    uint256 private minimumRaise;
    /// @dev as per `SaleConfig`.
    uint256 private dustSize;
    /// @dev as per `SaleConfig`.
    /// Exposed via. `ISale.reserve()`.
    IERC20 private _reserve;

    /// @dev the current sale status exposed as `ISale.saleStatus`.
    SaleStatus private _saleStatus;
    /// @dev the current sale can always end in failure at this block even if
    /// it did not start. Provided it did not already end of course.
    uint256 private saleTimeout;

    /// @dev remaining rTKN units to sell. MAY NOT be the rTKN balance of the
    /// Sale contract if rTKN has been sent directly to the sale contract
    /// outside the standard buy/refund loop.
    uint256 private _remainingUnits;
    /// @dev total reserve taken in to the sale contract via. buys. Does NOT
    /// include any reserve sent directly to the sale contract outside the
    /// standard buy/refund loop.
    uint256 private _totalReserveIn;

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
        self = address(this);
        vmStateBuilder = config_.vmStateBuilder;
        maximumSaleTimeout = config_.maximumSaleTimeout;

        redeemableERC20Factory = config_.redeemableERC20Factory;

        emit Construct(msg.sender, config_);
    }

    function initialize(
        SaleConfig calldata config_,
        SaleRedeemableERC20Config memory saleRedeemableERC20Config_
    ) external initializer {
        initializeCooldown(config_.cooldownDuration);

        require(config_.saleTimeout <= maximumSaleTimeout, "MAX_TIMEOUT");
        saleTimeout = block.number + config_.saleTimeout;

        // 0 minimum raise is ambiguous as to how it should be handled. It
        // literally means "the raise succeeds without any trades", which
        // doesn't have a clear way to move funds around as there are no
        // recipients of potentially escrowed or redeemable funds. There needs
        // to be at least 1 reserve token paid from 1 buyer in order to
        // meaningfully process success logic.
        require(config_.minimumRaise > 0, "MIN_RAISE_0");
        minimumRaise = config_.minimumRaise;

        // !! WARNING !! - NEED TO INCLUDE OTHER ENTRYPOINTS HERE!
        bytes memory vmStateBytes = VMStateBuilder(vmStateBuilder).buildState(self, config_.vmStateConfig, CALCULATE_PRICE_ENTRYPOINT);

        recipient = config_.recipient;

        dustSize = config_.dustSize;

        // just making this explicit during initialization in case it ever
        // takes a nonzero value somehow due to refactor.
        _saleStatus = SaleStatus.Pending;

        _reserve = config_.reserve;

        // The distributor of the rTKN is always set to the sale contract.
        // It is an error for the deployer to attempt to set the distributor.
        require(
            saleRedeemableERC20Config_.erc20Config.distributor == address(0),
            "DISTRIBUTOR_SET"
        );
        saleRedeemableERC20Config_.erc20Config.distributor = address(this);

        _remainingUnits = saleRedeemableERC20Config_.erc20Config.initialSupply;

        RedeemableERC20 token_ = RedeemableERC20(
            redeemableERC20Factory.createChild(
                abi.encode(
                    RedeemableERC20Config(
                        address(config_.reserve),
                        saleRedeemableERC20Config_.erc20Config,
                        saleRedeemableERC20Config_.tier,
                        saleRedeemableERC20Config_.minimumTier,
                        saleRedeemableERC20Config_
                            .distributionEndForwardingAddress
                    )
                )
            )
        );
        _token = token_;

        emit Initialize(msg.sender, config_, address(token_));
    }

    /// @inheritdoc ISale
    function token() external view returns (address) {
        return address(_token);
    }

    /// @inheritdoc ISale
    function reserve() external view returns (address) {
        return address(_reserve);
    }

    /// @inheritdoc ISale
    function saleStatus() external view returns (SaleStatus) {
        return _saleStatus;
    }

    /// Can the sale start?
    /// Evals `canStartStatePointer` to a boolean that determines whether the
    /// sale can start (move from pending to active). Buying from and ending
    /// the sale will both always fail if the sale never started.
    /// The sale can ONLY start if it is currently in pending status.
    function canStart() public view returns (bool) {
        // Only a pending sale can start. Starting a sale more than once would
        // always be a bug.
        if (_saleStatus == SaleStatus.Pending) {
            State memory state_ = LibState.fromBytesPacked(
                SSTORE2.read(vmStatePointer)
            );
            eval("", state_, CAN_START_ENTRYPOINT);
            return state_.stack[state_.stackIndex - 1] > 0;
        } else {
            return false;
        }
    }

    /// Can the sale end?
    /// Evals `canEndStatePointer` to a boolean that determines whether the
    /// sale can end (move from active to success/fail). Buying will fail if
    /// the sale has ended.
    /// If the sale is out of rTKN stock it can ALWAYS end and in this case
    /// will NOT eval the "can end" script.
    /// The sale can ONLY end if it is currently in active status.
    function canEnd() public view returns (bool) {
        // Only an active sale can end. Ending an ended or pending sale would
        // always be a bug.
        if (_saleStatus == SaleStatus.Active) {
            // It is always possible to end an out of stock sale because at
            // this point the only further buys that can happen are after a
            // refund, and it makes no sense that someone would refund at a low
            // price to buy at a high price. Therefore we should end the sale
            // and tally the final result as soon as we sell out.
            if (_remainingUnits < 1) {
                return true;
            }
            // The raise is active and still has stock remaining so we delegate
            // to the appropriate script for an answer.
            else {
                State memory state_ = LibState.fromBytesPacked(
                    SSTORE2.read(vmStatePointer)
                );
                eval("", state_, CAN_END_ENTRYPOINT);
                return state_.stack[state_.stackIndex - 1] > 0;
            }
        } else {
            return false;
        }
    }

    /// Calculates the current reserve price quoted for 1 unit of rTKN.
    /// Used internally to process `buy`.
    /// @param units_ Amount of rTKN to quote a price for, will be available to
    /// the price script from OPCODE_CURRENT_BUY_UNITS.
    function calculatePrice(uint256 units_) public view returns (uint256) {
        State memory state_ = LibState.fromBytesPacked(
            SSTORE2.read(vmStatePointer)
        );
        bytes memory context_ = new bytes(0x20);
        assembly {
            mstore(add(context_, 0x20), units_)
        }
        eval(context_, state_, CALCULATE_PRICE_ENTRYPOINT);

        return state_.stack[state_.stackIndex - 1];
    }

    /// Start the sale (move from pending to active).
    /// `canStart` MUST return true.
    function start() external {
        require(canStart(), "CANT_START");
        _saleStatus = SaleStatus.Active;
        emit Start(msg.sender);
    }

    /// End the sale (move from active to success or fail).
    /// `canEnd` MUST return true.
    function end() public {
        require(canEnd(), "CANT_END");

        bool success_ = _totalReserveIn >= minimumRaise;
        SaleStatus endStatus_ = success_ ? SaleStatus.Success : SaleStatus.Fail;

        _remainingUnits = 0;
        _saleStatus = endStatus_;
        emit End(msg.sender, endStatus_);
        _token.endDistribution(address(this));

        // Only send reserve to recipient if the raise is a success.
        // If the raise is NOT a success then everyone can refund their reserve
        // deposited individually.
        if (success_) {
            _reserve.safeTransfer(recipient, _totalReserveIn);
        }
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
        require(saleTimeout < block.number, "EARLY_TIMEOUT");
        require(
            _saleStatus == SaleStatus.Pending ||
                _saleStatus == SaleStatus.Active,
            "ALREADY_ENDED"
        );

        // Mimic `end` with a failed state but `Timeout` event.
        _remainingUnits = 0;
        _saleStatus = SaleStatus.Fail;
        emit Timeout(msg.sender);
        _token.endDistribution(address(this));
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
    function buy(BuyConfig memory config_)
        external
        onlyAfterCooldown
        nonReentrant
    {
        require(0 < config_.minimumUnits, "0_MINIMUM");
        require(
            config_.minimumUnits <= config_.desiredUnits,
            "MINIMUM_OVER_DESIRED"
        );

        require(_saleStatus == SaleStatus.Active, "NOT_ACTIVE");

        uint256 units_ = config_.desiredUnits.min(_remainingUnits);
        require(units_ >= config_.minimumUnits, "INSUFFICIENT_STOCK");

        uint256 price_ = calculatePrice(units_);

        require(price_ <= config_.maximumPrice, "MAXIMUM_PRICE");
        uint256 cost_ = price_.fixedPointMul(units_);

        Receipt memory receipt_ = Receipt(
            nextReceiptId,
            config_.feeRecipient,
            config_.fee,
            units_,
            price_
        );
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
        _remainingUnits -= units_;
        _totalReserveIn += cost_;

        // This happens before `end` so that the transfer from happens before
        // the transfer to.
        // `end` changes state so `buy` needs to be nonReentrant.
        _reserve.safeTransferFrom(
            msg.sender,
            address(this),
            cost_ + config_.fee
        );
        // This happens before `end` so that the transfer happens before the
        // distributor is burned and token is frozen.
        IERC20(address(_token)).safeTransfer(msg.sender, units_);

        if (_remainingUnits < 1) {
            end();
        } else {
            require(_remainingUnits >= dustSize, "DUST");
        }

        emit Buy(msg.sender, config_, receipt_);
    }

    /// @dev This is here so we can use a modifier like a function call.
    function refundCooldown()
        private
        onlyAfterCooldown
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Rollback a buy given its receipt.
    /// Ignoring gas (which cannot be refunded) the refund process rolls back
    /// all state changes caused by a buy, other than the receipt id increment.
    /// Refunds are limited by the global cooldown to mitigate rapid buy/refund
    /// cycling that could cause volatile price curves or other unwanted side
    /// effects for other sale participants. Cooldowns are bypassed if the sale
    /// ends and is a failure.
    /// @param receipt_ The receipt of the buy to rollback.
    function refund(Receipt calldata receipt_) external {
        require(_saleStatus != SaleStatus.Success, "REFUND_SUCCESS");
        // If the sale failed then cooldowns do NOT apply. Everyone should
        // immediately refund all their receipts.
        if (_saleStatus != SaleStatus.Fail) {
            refundCooldown();
        }

        // Checked math here will prevent consuming a receipt that doesn't
        // exist or was already refunded as it will underflow.
        receipts[msg.sender][keccak256(abi.encode(receipt_))]--;

        uint256 cost_ = receipt_.price.fixedPointMul(receipt_.units);

        _totalReserveIn -= cost_;
        _remainingUnits += receipt_.units;
        fees[receipt_.feeRecipient] -= receipt_.fee;

        emit Refund(msg.sender, receipt_);

        IERC20(address(_token)).safeTransferFrom(
            msg.sender,
            address(this),
            receipt_.units
        );
        _reserve.safeTransfer(msg.sender, cost_ + receipt_.fee);
    }

    /// After a sale ends in success all fees collected for a recipient can be
    /// cleared. If the raise is active or fails then fees cannot be claimed as
    /// they are set aside in case of refund. A failed raise implies that all
    /// buyers should immediately refund and zero fees claimed.
    /// @param recipient_ The recipient to claim fees for. Does NOT need to be
    /// the `msg.sender`.
    function claimFees(address recipient_) external {
        require(_saleStatus == SaleStatus.Success, "NOT_SUCCESS");
        uint256 amount_ = fees[recipient_];
        if (amount_ > 0) {
            delete fees[recipient_];
            _reserve.safeTransfer(recipient_, amount_);
        }
    }

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.fnPtrs();
    }
}
