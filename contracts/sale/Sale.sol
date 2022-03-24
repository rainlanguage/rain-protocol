// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Cooldown} from "../cooldown/Cooldown.sol";

import "../math/FixedPointMath.sol";
import "../vm/RainVM.sol";
import {BlockOps} from "../vm/ops/BlockOps.sol";
import {MathOps} from "../vm/ops/MathOps.sol";
import {FixedPointMathOps} from "../vm/ops/FixedPointMathOps.sol";
import {LogicOps} from "../vm/ops/LogicOps.sol";
import {SenderOps} from "../vm/ops/SenderOps.sol";
import {TierOps} from "../vm/ops/TierOps.sol";
import {IERC20Ops} from "../vm/ops/IERC20Ops.sol";
import {IERC721Ops} from "../vm/ops/IERC721Ops.sol";
import {IERC1155Ops} from "../vm/ops/IERC1155Ops.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
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

/// Everything required to construct a Sale (not initialize).
/// @param maximumCooldownDuration The cooldown duration set in initialize
/// cannot exceed this. Avoids the "no refunds" situation where someone sets an
/// infinite cooldown, then accidentally or maliciously the sale ends up in a
/// state where it cannot end (bad "can end" script), leading to trapped funds.
/// @param redeemableERC20Factory The factory contract that creates redeemable
/// erc20 tokens that the `Sale` can mint, sell and burn.
struct SaleConstructorConfig {
    uint256 maximumCooldownDuration;
    RedeemableERC20Factory redeemableERC20Factory;
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
/// @param cooldownDuration forwarded to `Cooldown` contract initialization.
/// @param minimumRaise defines the amount of reserve required to raise that
/// defines success/fail of the sale. Reaching the minimum raise DOES NOT cause
/// the raise to end early (unless the "can end" script allows it of course).
/// @param dustSize The minimum amount of rTKN that must remain in the Sale
/// contract unless it is all purchased, clearing the raise to 0 stock and thus
/// ending the raise.
struct SaleConfig {
    StateConfig canStartStateConfig;
    StateConfig canEndStateConfig;
    StateConfig calculatePriceStateConfig;
    address recipient;
    IERC20 reserve;
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

// solhint-disable-next-line max-states-count
contract Sale is
    Initializable,
    Cooldown,
    RainVM,
    VMState,
    ISale,
    ReentrancyGuard
{
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

    /// @dev local opcode to stack remaining rTKN units.
    uint256 private constant REMAINING_UNITS = 0;
    /// @dev local opcode to stack total reserve taken in so far.
    uint256 private constant TOTAL_RESERVE_IN = 1;
    /// @dev local opcode to stack the rTKN units/amount of the current buy.
    uint256 private constant CURRENT_BUY_UNITS = 2;
    /// @dev local opcode to stack the address of the rTKN.
    uint256 private constant TOKEN_ADDRESS = 3;
    /// @dev local opcode to stack the address of the reserve token.
    uint256 private constant RESERVE_ADDRESS = 4;
    /// @dev local opcodes length.
    uint256 internal constant LOCAL_OPS_LENGTH = 5;

    /// @dev local offset for block ops.
    uint256 private immutable blockOpsStart;
    /// @dev local offset for sender ops.
    uint256 private immutable senderOpsStart;
    /// @dev local offset for logic ops.
    uint256 private immutable logicOpsStart;
    /// @dev local offset for math ops.
    uint256 private immutable mathOpsStart;
    /// @dev local offset for fixed point math ops.
    uint256 private immutable fixedPointMathOpsStart;
    /// @dev local offset for tier ops.
    uint256 private immutable tierOpsStart;
    /// @dev local offset for erc20 ops.
    uint256 private immutable ierc20OpsStart;
    /// @dev local offset for erc721 ops.
    uint256 private immutable ierc721OpsStart;
    /// @dev local offset for erc1155 ops.
    uint256 private immutable ierc1155OpsStart;
    /// @dev local offset for local ops.
    uint256 private immutable localOpsStart;
    /// @dev the cooldown duration cannot exceed this. Prevents "no refunds" in
    /// a raise that never ends. Configured at the factory level upon deploy.
    uint256 private immutable maximumCooldownDuration;

    /// Factory responsible for minting rTKN.
    RedeemableERC20Factory private immutable redeemableERC20Factory;
    /// Minted rTKN for each sale.
    /// Exposed via. `ISale.token()`.
    RedeemableERC20 private _token;

    /// @dev as per `SaleConfig`.
    address private recipient;
    /// @dev as per `SaleConfig`.
    address private canStartStatePointer;
    /// @dev as per `SaleConfig`.
    address private canEndStatePointer;
    /// @dev as per `SaleConfig`.
    address private calculatePriceStatePointer;
    /// @dev as per `SaleConfig`.
    uint256 private minimumRaise;
    /// @dev as per `SaleConfig`.
    uint256 private dustSize;
    /// @dev as per `SaleConfig`.
    /// Exposed via. `ISale.reserve()`.
    IERC20 private _reserve;

    /// @dev remaining rTKN units to sell. MAY NOT be the rTKN balance of the
    /// Sale contract if rTKN has been sent directly to the sale contract
    /// outside the standard buy/refund loop.
    uint256 private remainingUnits;
    /// @dev total reserve taken in to the sale contract via. buys. Does NOT
    /// include any reserve sent directly to the sale contract outside the
    /// standard buy/refund loop.
    uint256 private totalReserveIn;
    /// @dev the current sale status exposed as `ISale.saleStatus`.
    SaleStatus private _saleStatus;

    /// @dev Binding buyers to receipt hashes to maybe a non-zero value.
    /// A receipt will only be honoured if the mapping resolves to non-zero.
    /// The receipt hashing ensures that receipts cannot be manipulated before
    /// redemption. Each mapping is deleted if/when receipt is used for refund.
    /// Buyer => keccak receipt => exists (1 or 0).
    mapping(address => mapping(bytes32 => uint256)) private receipts;
    /// @dev simple incremental counter to keep all receipts unique so that
    /// receipt hashes bound to buyers never collide.
    uint256 private nextReceiptId;

    /// @dev Tracks combined fees per recipient to be claimed if/when a sale
    /// is successful.
    /// Fee recipient => unclaimed fees.
    mapping(address => uint256) private fees;

    constructor(SaleConstructorConfig memory config_) {
        blockOpsStart = RainVM.OPS_LENGTH;
        senderOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
        logicOpsStart = senderOpsStart + SenderOps.OPS_LENGTH;
        mathOpsStart = logicOpsStart + LogicOps.OPS_LENGTH;
        fixedPointMathOpsStart = mathOpsStart + MathOps.OPS_LENGTH;
        tierOpsStart = fixedPointMathOpsStart + FixedPointMathOps.OPS_LENGTH;
        ierc20OpsStart = tierOpsStart + TierOps.OPS_LENGTH;
        ierc721OpsStart = ierc20OpsStart + IERC20Ops.OPS_LENGTH;
        ierc1155OpsStart = ierc721OpsStart + IERC721Ops.OPS_LENGTH;
        localOpsStart = ierc1155OpsStart + IERC1155Ops.OPS_LENGTH;

        maximumCooldownDuration = config_.maximumCooldownDuration;

        redeemableERC20Factory = config_.redeemableERC20Factory;

        emit Construct(msg.sender, config_);
    }

    function initialize(
        SaleConfig memory config_,
        SaleRedeemableERC20Config memory saleRedeemableERC20Config_
    ) external initializer {
        require(
            config_.cooldownDuration <= maximumCooldownDuration,
            "MAX_COOLDOWN"
        );
        initializeCooldown(config_.cooldownDuration);

        // If the raise really does have a minimum of `0` and `0` trading
        // happens then the raise will be considered a "success", burning all
        // rTKN, which would trap any escrowed or deposited funds that nobody
        // can retrieve as nobody holds any rTKN.
        // If you want `0` or very low minimum raise consider enabling rTKN
        // forwarding for unsold inventory.
        if (
            saleRedeemableERC20Config_.distributionEndForwardingAddress ==
            address(0)
        ) {
            require(config_.minimumRaise > 0, "MIN_RAISE_0");
        }
        minimumRaise = config_.minimumRaise;

        canStartStatePointer = _snapshot(
            _newState(config_.canStartStateConfig)
        );
        canEndStatePointer = _snapshot(_newState(config_.canEndStateConfig));
        calculatePriceStatePointer = _snapshot(
            _newState(config_.calculatePriceStateConfig)
        );
        recipient = config_.recipient;

        dustSize = config_.dustSize;
        // just making this explicit during initialization in case it ever
        // takes a nonzero value somehow due to refactor.
        _saleStatus = SaleStatus.Pending;

        _reserve = config_.reserve;
        saleRedeemableERC20Config_.erc20Config.distributor = address(this);

        remainingUnits = saleRedeemableERC20Config_.erc20Config.initialSupply;

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
        if (_saleStatus != SaleStatus.Pending) {
            return false;
        }
        State memory state_ = _restore(canStartStatePointer);
        eval("", state_, 0);
        return state_.stack[state_.stackIndex - 1] > 0;
    }

    /// Can the sale end?
    /// Evals `canEndStatePointer` to a boolean that determines whether the
    /// sale can end (move from active to success/fail). Buying will fail if
    /// the sale has ended.
    /// If the sale is out of rTKN stock it can ALWAYS end and in this case
    /// will NOT eval the "can end" script.
    /// The sale can ONLY end if it is currently in active status.
    function canEnd() public view returns (bool) {
        if (_saleStatus != SaleStatus.Active) {
            return false;
        }
        if (remainingUnits < 1) {
            return true;
        }
        State memory state_ = _restore(canEndStatePointer);
        eval("", state_, 0);
        return state_.stack[state_.stackIndex - 1] > 0;
    }

    /// Calculates the current reserve price quoted for 1 unit of rTKN.
    /// Used internally to process `buy`.
    /// @param units_ Amount of rTKN to quote a price for, will be available to
    /// the price script from CURRENT_BUY_UNITS.
    function calculatePrice(uint256 units_) public view returns (uint256) {
        State memory state_ = _restore(calculatePriceStatePointer);
        eval(abi.encode(units_), state_, 0);

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

        remainingUnits = 0;

        bool success_ = totalReserveIn >= minimumRaise;
        SaleStatus endStatus_ = success_ ? SaleStatus.Success : SaleStatus.Fail;
        emit End(msg.sender, endStatus_);
        _saleStatus = endStatus_;

        // Let the rTKN handle its own distribution end logic.
        _token.endDistribution(address(this));

        // Only send reserve to recipient if the raise is a success.
        if (success_) {
            _reserve.safeTransfer(recipient, totalReserveIn);
        }
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
        require(config_.desiredUnits > 0, "0_DESIRED");
        require(
            config_.minimumUnits <= config_.desiredUnits,
            "MINIMUM_OVER_DESIRED"
        );

        require(_saleStatus == SaleStatus.Active, "NOT_ACTIVE");

        uint256 units_ = config_.desiredUnits.min(remainingUnits).max(
            config_.minimumUnits
        );
        require(units_ <= remainingUnits, "INSUFFICIENT_STOCK");

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
        receipts[msg.sender][keccak256(abi.encode(receipt_))] = 1;

        fees[config_.feeRecipient] += config_.fee;

        // We ignore any rTKN or reserve that is sent to the contract directly
        // outside of a `buy` call. This also means we don't support reserve
        // tokens with balances that can change outside of transfers
        // (e.g. rebase).
        remainingUnits -= units_;
        totalReserveIn += cost_;

        // This happens before `end` so that the transfer out happens before
        // the last transfer in.
        // `end` does state changes so `buy` needs to be nonReentrant.
        _reserve.safeTransferFrom(
            msg.sender,
            address(this),
            cost_ + config_.fee
        );
        // This happens before `end` so that the transfer happens before the
        // distributor is burned and token is frozen.
        IERC20(address(_token)).safeTransfer(msg.sender, units_);

        if (remainingUnits < 1) {
            end();
        } else {
            require(remainingUnits >= dustSize, "DUST");
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

        bytes32 receiptKeccak_ = keccak256(abi.encode(receipt_));
        require(receipts[msg.sender][receiptKeccak_] > 0, "INVALID_RECEIPT");
        delete receipts[msg.sender][receiptKeccak_];

        uint256 cost_ = receipt_.price.fixedPointMul(receipt_.units);

        totalReserveIn -= cost_;
        remainingUnits += receipt_.units;
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
        delete fees[recipient_];
        _reserve.safeTransfer(recipient_, amount_);
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            if (opcode_ < senderOpsStart) {
                BlockOps.applyOp(
                    context_,
                    state_,
                    opcode_ - blockOpsStart,
                    operand_
                );
            } else if (opcode_ < logicOpsStart) {
                SenderOps.applyOp(
                    context_,
                    state_,
                    opcode_ - senderOpsStart,
                    operand_
                );
            } else if (opcode_ < mathOpsStart) {
                LogicOps.applyOp(
                    context_,
                    state_,
                    opcode_ - logicOpsStart,
                    operand_
                );
            } else if (opcode_ < fixedPointMathOpsStart) {
                MathOps.applyOp(
                    context_,
                    state_,
                    opcode_ - mathOpsStart,
                    operand_
                );
            } else if (opcode_ < tierOpsStart) {
                FixedPointMathOps.applyOp(
                    context_,
                    state_,
                    opcode_ - fixedPointMathOpsStart,
                    operand_
                );
            } else if (opcode_ < ierc20OpsStart) {
                TierOps.applyOp(
                    context_,
                    state_,
                    opcode_ - tierOpsStart,
                    operand_
                );
            } else if (opcode_ < ierc721OpsStart) {
                IERC20Ops.applyOp(
                    context_,
                    state_,
                    opcode_ - ierc20OpsStart,
                    operand_
                );
            } else if (opcode_ < ierc1155OpsStart) {
                IERC721Ops.applyOp(
                    context_,
                    state_,
                    opcode_ - ierc721OpsStart,
                    operand_
                );
            } else if (opcode_ < localOpsStart) {
                IERC1155Ops.applyOp(
                    context_,
                    state_,
                    opcode_ - ierc1155OpsStart,
                    operand_
                );
            } else {
                opcode_ -= localOpsStart;
                require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
                if (opcode_ == REMAINING_UNITS) {
                    state_.stack[state_.stackIndex] = remainingUnits;
                } else if (opcode_ == TOTAL_RESERVE_IN) {
                    state_.stack[state_.stackIndex] = totalReserveIn;
                } else if (opcode_ == CURRENT_BUY_UNITS) {
                    uint256 units_ = abi.decode(context_, (uint256));
                    state_.stack[state_.stackIndex] = units_;
                } else if (opcode_ == TOKEN_ADDRESS) {
                    state_.stack[state_.stackIndex] = uint256(
                        uint160(address(_token))
                    );
                } else if (opcode_ == RESERVE_ADDRESS) {
                    state_.stack[state_.stackIndex] = uint256(
                        uint160(address(_reserve))
                    );
                }
                state_.stackIndex++;
            }
        }
    }
}
