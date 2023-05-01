// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ERC20Config} from "../erc20/ERC20Config.sol";
import "../erc20/ERC20Redeem.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import {ITierV2} from "../tier/ITierV2.sol";
import {TierReport} from "../tier/libraries/TierReport.sol";

import {Phased} from "../phased/Phased.sol";
import "rain.interface.factory/ICloneableV1.sol";

import {ERC165CheckerUpgradeable as ERC165Checker} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";

/// Thrown when the initial supply is less than the minimum upon initialization.
/// @param supply The supply that was provided (that is too low).
error MinimumInitialSupply(uint256 supply);

/// Thrown when a referenced tier contract is not self reporting as a `TierV2`
/// according to ERC165.
/// @param account The account that is NOT a `TierV2` according to ERC165.
error BadTierV2(address account);

/// Thrown when the caller is not an admin for an admin-only call.
/// @param sender The caller.
error OnlyAdmin(address sender);

/// Thrown when tokens are sent to itself.
error TokenSelfSend();

/// Thrown when tokens are sent while frozen.
error Frozen();

/// Thrown when tokens are sent away from the hub/spoke.
error Spoke2Hop();

/// Thrown when the receiver does not have the minimum tier.
error MinimumTier(uint256 minimum, uint256 actual);

/// @dev Contract is not yet initialized.
uint256 constant REDEEMABLE_ERC20_PHASE_UNINITIALIZED = 0;
/// @dev Token is in the distribution phase and can be transferred freely subject
/// to tier requirements.
uint256 constant REDEEMABLE_ERC20_PHASE_DISTRIBUTING = 1;
/// @dev Token is frozen and cannot be transferred unless the sender/receiver is
/// authorized as a sender/receiver.
uint256 constant REDEEMABLE_ERC20_PHASE_FROZEN = 2;

/// @dev Bits for a receiver.
uint256 constant RECEIVER = 0x1;
/// @dev Bits for a sender.
uint256 constant SENDER = 0x2;

/// @dev RedeemableERC20 uses the standard/default 18 ERC20 decimals.
/// The minimum initial supply enforced by the initializer is "one" token which
/// is `1e18`
/// The minimum initial supply does not prevent the supply reducing due to
/// subsequent redemption/burning.
uint256 constant REDEEMABLE_ERC20_MINIMUM_INITIAL_SUPPLY = 1e18;

/// Everything required by the `RedeemableERC20` constructor.
/// @param reserve Reserve token that the associated `Trust` or equivalent
/// raise contract will be forwarding to the `RedeemableERC20` contract.
/// @param erc20Config ERC20 config forwarded to the ERC20 constructor.
/// @param tier Tier contract to compare statuses against on transfer.
/// @param minimumTier Minimum tier required for transfers in `Phase.ZERO`.
/// Can be `0`.
/// @param distributionEndForwardingAddress Optional address to send rTKN to at
/// the end of the distribution phase. If `0` address then all undistributed
/// rTKN will burn itself at the end of the distribution.
struct RedeemableERC20Config {
    address reserve;
    ERC20Config erc20Config;
    address tier;
    uint256 minimumTier;
    address distributionEndForwardingAddress;
}

/// @title RedeemableERC20
/// @notice This is the ERC20 token that is minted and distributed.
///
/// During `Phase.ZERO` the token can be traded and so compatible with the
/// Balancer pool mechanics.
///
/// During `Phase.ONE` the token is frozen and no longer able to be traded on
/// any AMM or transferred directly.
///
/// The token can be redeemed during `Phase.ONE` which burns the token in
/// exchange for pro-rata erc20 tokens held by the `RedeemableERC20` contract
/// itself.
///
/// The token balances can be used indirectly for other claims, promotions and
/// events as a proof of participation in the original distribution by token
/// holders.
///
/// The token can optionally be restricted by the `ITierV2` contract to only
/// allow receipients with a specified membership status.
///
/// @dev `RedeemableERC20` is an ERC20 with 2 phases.
///
/// `Phase.ZERO` is the distribution phase where the token can be freely
/// transfered but not redeemed.
/// `Phase.ONE` is the redemption phase where the token can be redeemed but no
/// longer transferred.
///
/// Redeeming some amount of `RedeemableERC20` burns the token in exchange for
/// some other tokens held by the contract. For example, if the
/// `RedeemableERC20` token contract holds 100 000 USDC then a holder of the
/// redeemable token can burn some of their tokens to receive a % of that USDC.
/// If they redeemed (burned) an amount equal to 10% of the redeemable token
/// supply then they would receive 10 000 USDC.
///
/// To make the treasury assets discoverable anyone can call `newTreasuryAsset`
/// to emit an event containing the treasury asset address. As malicious and/or
/// spam users can emit many treasury events there is a need for sensible
/// indexing and filtering of asset events to only trusted users. This contract
/// is agnostic to how that trust relationship is defined for each user.
///
/// Users must specify all the treasury assets they wish to redeem to the
/// `redeem` function. After `redeem` is called the redeemed tokens are burned
/// so all treasury assets must be specified and claimed in a batch atomically.
/// Note: The same amount of `RedeemableERC20` is burned, regardless of which
/// treasury assets were specified. Specifying fewer assets will NOT increase
/// the proportion of each that is returned.
///
/// `RedeemableERC20` has several owner administrative functions:
/// - Owner can add senders and receivers that can send/receive tokens even
///   during `Phase.ONE`
/// - Owner can end `Phase.ONE` during `Phase.ZERO` by specifying the address
///   of a distributor, which will have any undistributed tokens burned.
/// The owner should be a `Trust` not an EOA.
///
/// The redeem functions MUST be used to redeem and burn RedeemableERC20s
/// (NOT regular transfers).
///
/// `redeem` will simply revert if called outside `Phase.ONE`.
/// A `Redeem` event is emitted on every redemption (per treasury asset) as
/// `(redeemer, asset, redeemAmount)`.
contract RedeemableERC20 is Initializable, ICloneableV1, Phased, ERC20Redeem {
    using SafeERC20 for IERC20;

    /// @dev To be clear, this admin is NOT intended to be an EOA.
    /// This contract is designed assuming the admin is a `Sale` or equivalent
    /// contract that itself does NOT have an admin key.
    address private admin;
    /// @dev Tracks addresses that can always send/receive regardless of phase.
    /// sender/receiver => access bits
    mapping(address => uint256) private access;

    /// Results of initializing.
    /// @param sender `msg.sender` of initialize.
    /// @param config Initialization config.
    event Initialize(address sender, RedeemableERC20Config config);

    /// A new token sender has been added.
    /// @param sender `msg.sender` that approved the token sender.
    /// @param grantedSender address that is now a token sender.
    event Sender(address sender, address grantedSender);

    /// A new token receiver has been added.
    /// @param sender `msg.sender` that approved the token receiver.
    /// @param grantedReceiver address that is now a token receiver.
    event Receiver(address sender, address grantedReceiver);

    /// Tier contract that produces the report that `minimumTier` is checked
    /// against.
    /// Public so external contracts can interface with the required tier.
    ITierV2 public tier;

    /// The minimum status that a user must hold to receive transfers during
    /// `Phase.ZERO`.
    /// The tier contract passed to `TierByConstruction` determines if
    /// the status is held during `_beforeTokenTransfer`.
    /// Public so external contracts can interface with the required tier.
    uint256 public minimumTier;

    /// Optional address to send rTKN to at the end of the distribution phase.
    /// If `0` address then all undistributed rTKN will burn itself at the end
    /// of the distribution.
    address private distributionEndForwardingAddress;

    constructor() {
        _disableInitializers();
    }

    /// Mint the full ERC20 token supply and configure basic transfer
    /// restrictions. Initializes all base contracts.
    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        initializePhased();

        RedeemableERC20Config memory config_ = abi.decode(
            data_,
            (RedeemableERC20Config)
        );

        tier = ITierV2(config_.tier);

        if (
            !ERC165Checker.supportsInterface(
                config_.tier,
                type(ITierV2).interfaceId
            )
        ) {
            revert BadTierV2(config_.tier);
        }

        __ERC20_init(config_.erc20Config.name, config_.erc20Config.symbol);

        if (
            config_.erc20Config.initialSupply <
            REDEEMABLE_ERC20_MINIMUM_INITIAL_SUPPLY
        ) {
            revert MinimumInitialSupply(config_.erc20Config.initialSupply);
        }

        minimumTier = config_.minimumTier;
        distributionEndForwardingAddress = config_
            .distributionEndForwardingAddress;

        // Minting and burning must never fail.
        access[address(0)] = RECEIVER | SENDER;

        // Admin receives full supply.
        access[config_.erc20Config.distributor] = RECEIVER;

        // Forwarding address must be able to receive tokens.
        if (distributionEndForwardingAddress != address(0)) {
            access[distributionEndForwardingAddress] = RECEIVER;
        }

        admin = config_.erc20Config.distributor;

        // Need to mint after assigning access.
        _mint(
            config_.erc20Config.distributor,
            config_.erc20Config.initialSupply
        );

        // The reserve must always be one of the treasury assets.
        newTreasuryAsset(config_.reserve);

        emit Initialize(msg.sender, config_);

        schedulePhase(REDEEMABLE_ERC20_PHASE_DISTRIBUTING, block.timestamp);
    }

    /// Require a function is only admin callable.
    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert OnlyAdmin(msg.sender);
        }
        _;
    }

    /// Check that an address is a receiver.
    /// A sender is also a receiver.
    /// @param maybeReceiver_ account to check.
    /// @return True if account is a receiver.
    function isReceiver(address maybeReceiver_) public view returns (bool) {
        return access[maybeReceiver_] & RECEIVER > 0;
    }

    /// Admin can grant an address receiver rights.
    /// @param newReceiver_ The account to grand receiver.
    function grantReceiver(address newReceiver_) external onlyAdmin {
        // Using `|` preserves sender if previously granted.
        access[newReceiver_] |= RECEIVER;
        emit Receiver(msg.sender, newReceiver_);
    }

    /// Check that an address is a sender.
    /// @param maybeSender_ account to check.
    /// @return True if account is a sender.
    function isSender(address maybeSender_) public view returns (bool) {
        return access[maybeSender_] & SENDER > 0;
    }

    /// Admin can grant an addres sender rights.
    /// @param newSender_ The account to grant sender.
    function grantSender(address newSender_) external onlyAdmin {
        // Uinsg `|` preserves receiver if previously granted.
        access[newSender_] |= SENDER;
        emit Sender(msg.sender, newSender_);
    }

    /// The admin can forward or burn all tokens of a single address to end
    /// `PHASE_DISTRIBUTING`.
    /// The intent is that during `PHASE_DISTRIBUTING` there is some contract
    /// responsible for distributing the tokens.
    /// The admin specifies the distributor to end `PHASE_DISTRIBUTING` and the
    /// forwarding address set during initialization is used. If the forwarding
    /// address is `0` the rTKN will be burned, otherwise the entire balance of
    /// the distributor is forwarded to the nominated address. In practical
    /// terms the forwarding allows for escrow depositors to receive a prorata
    /// claim on unsold rTKN if they forward it to themselves, otherwise raise
    /// participants will receive a greater share of the final escrowed tokens
    /// due to the burn reducing the total supply.
    /// The distributor is NOT set during the constructor because it may not
    /// exist at that point. For example, Balancer needs the paired erc20
    /// tokens to exist before the trading pool can be built.
    /// @param distributor_ The distributor according to the admin.
    /// BURN the tokens if `address(0)`.
    function endDistribution(
        address distributor_
    ) external onlyPhase(REDEEMABLE_ERC20_PHASE_DISTRIBUTING) onlyAdmin {
        schedulePhase(REDEEMABLE_ERC20_PHASE_FROZEN, block.timestamp);
        address forwardTo_ = distributionEndForwardingAddress;
        uint256 distributorBalance_ = balanceOf(distributor_);
        if (distributorBalance_ > 0) {
            if (forwardTo_ == address(0)) {
                _burn(distributor_, distributorBalance_);
            } else {
                _transfer(distributor_, forwardTo_, distributorBalance_);
            }
        }
    }

    /// Wraps `_redeem` from `ERC20Redeem`.
    /// Very thin wrapper so be careful when calling!
    /// @param treasuryAssets_ The treasury assets to redeem for. If this is
    /// empty or incomplete then tokens will be permanently burned for no
    /// reason by the caller and the remaining funds will be effectively
    /// redistributed to everyone else.
    function redeem(
        IERC20[] calldata treasuryAssets_,
        uint256 redeemAmount_
    ) external onlyPhase(REDEEMABLE_ERC20_PHASE_FROZEN) {
        _redeem(treasuryAssets_, redeemAmount_);
    }

    /// Apply phase sensitive transfer restrictions.
    /// During `Phase.ZERO` only tier requirements apply.
    /// During `Phase.ONE` all transfers except burns are prevented.
    /// If a transfer involves either a sender or receiver with the SENDER
    /// or RECEIVER role, respectively, it will bypass these restrictions.
    /// @inheritdoc ERC20Upgradeable
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);

        // Sending tokens to this contract (e.g. instead of redeeming) is
        // always an error.
        if (receiver_ == address(this)) {
            revert TokenSelfSend();
        }

        // Some contracts may attempt a preflight (e.g. Balancer) of a 0 amount
        // transfer.
        // We don't want to accidentally cause external errors due to zero
        // value transfers.
        if (
            amount_ > 0 &&
            // The sender and receiver lists bypass all access restrictions.
            !(isSender(sender_) || isReceiver(receiver_))
        ) {
            // During `REDEEMABLE_ERC20_PHASE_DISTRIBUTING` transfers are only
            // restricted by the tier of the recipient. Every other phase only
            // allows senders and receivers as above.
            if (currentPhase() != REDEEMABLE_ERC20_PHASE_DISTRIBUTING) {
                revert Frozen();
            }

            // Receivers act as "hubs" that can send to "spokes".
            // i.e. any address of the minimum tier.
            // Spokes cannot send tokens another "hop" e.g. to each other.
            // Spokes can only send back to a receiver (doesn't need to be
            // the same receiver they received from).
            if (!isReceiver(sender_)) {
                revert Spoke2Hop();
            }
            uint256 receiverTier_ = TierReport.tierAtTimeFromReport(
                tier.report(receiver_, new uint256[](0)),
                block.timestamp
            );
            uint256 minimumTier_ = minimumTier;
            if (receiverTier_ < minimumTier_) {
                revert MinimumTier(minimumTier_, receiverTier_);
            }
        }
    }
}
