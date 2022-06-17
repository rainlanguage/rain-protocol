// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {ERC20Config} from "../../erc20/ERC20Config.sol";
import "../../erc20/ERC20Redeem.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITierV2} from "../../tier/ITierV2.sol";
import {TierReport} from "../../tier/libraries/TierReport.sol";

import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

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
contract SaleToken is Initializable, ERC20Redeem {
    using SafeERC20 for IERC20;

    /// @dev Phase constants.
    /// Contract is not yet initialized.
    uint256 private constant PHASE_UNINITIALIZED = 0;
    /// @dev Token is in the distribution phase and can be transferred freely
    /// subject to tier requirements.
    uint256 private constant PHASE_DISTRIBUTING = 1;
    /// @dev Token is frozen and cannot be transferred unless the
    /// sender/receiver is authorized as a sender/receiver.
    uint256 private constant PHASE_FROZEN = 2;

    /// @dev Bits for a receiver.
    uint256 private constant RECEIVER = 0x1;

    /// @dev To be clear, this sale is NOT intended to be an EOA.
    /// This contract is designed assuming the sale is a `Sale` or equivalent
    /// contract that itself does NOT have an admin key, and can correctly
    /// handle workflows such as `endSale()`.
    address private sale;

    /// Results of initializing.
    /// @param sender `msg.sender` of initialize.
    /// @param config Initialization config.
    event Initialize(address sender, RedeemableERC20Config config);

    /// RedeemableERC20 uses the standard/default 18 ERC20 decimals.
    /// The minimum supply enforced by the constructor is "one" token which is
    /// `10 ** 18`.
    /// The minimum supply does not prevent subsequent redemption/burning.
    uint256 private constant MINIMUM_INITIAL_SUPPLY = 10**18;

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

    /// Mint the full ERC20 token supply and configure basic transfer
    /// restrictions. Initializes all base contracts.
    /// @param config_ Initialized configuration.
    function initialize(RedeemableERC20Config calldata config_)
        external
        initializer
    {
        initializePhased();

        tier = ITierV2(config_.tier);

        require(
            ERC165Checker.supportsInterface(
                config_.tier,
                type(ITierV2).interfaceId
            ),
            "ERC165_TIERV2"
        );

        __ERC20_init(config_.erc20Config.name, config_.erc20Config.symbol);

        require(
            config_.erc20Config.initialSupply >= MINIMUM_INITIAL_SUPPLY,
            "MINIMUM_INITIAL_SUPPLY"
        );
        minimumTier = config_.minimumTier;
        distributionEndForwardingAddress = config_
            .distributionEndForwardingAddress;

        sale = config_.erc20Config.distributor;

        // Need to mint after assigning access.
        _mint(
            config_.erc20Config.distributor,
            config_.erc20Config.initialSupply
        );

        // The reserve must always be one of the treasury assets.
        newTreasuryAsset(config_.reserve);

        emit Initialize(msg.sender, config_);

        schedulePhase(PHASE_DISTRIBUTING, block.timestamp);
    }

    /// Require a function is only callable by the sale.
    modifier onlySale() {
        require(msg.sender == sale, "ONLY_SALE");
        _;
    }

    /// Check that an address is a receiver.
    /// A sender is also a receiver.
    /// @param maybeReceiver_ account to check.
    /// @return True if account is a receiver.
    function isReceiver(address maybeReceiver_) public view returns (bool) {
        return access[maybeReceiver_] & RECEIVER > 0;
    }

    /// Check that an address is a sender.
    /// @param maybeSender_ account to check.
    /// @return True if account is a sender.
    function isSender(address maybeSender_) public view returns (bool) {
        return access[maybeSender_] & SENDER > 0;
    }

    function burnSaleShares() external onlySale {
        uint256 sharesBalance_ = balanceOf(msg.sender);
        if (sharesBalance_ > 0) {
            _burn(msg.sender, sharesBalance_);
        }
    }

    /// Wraps `_redeem` from `ERC20Redeem`.
    /// Very thin wrapper so be careful when calling!
    /// @param treasuryAssets_ The treasury assets to redeem for. If this is
    /// empty or incomplete then tokens will be permanently burned for no
    /// reason by the caller and the remaining funds will be effectively
    /// redistributed to everyone else.
    function redeem(IERC20[] calldata treasuryAssets_, uint256 redeemAmount_)
        external
        onlyPhase(PHASE_FROZEN)
    {
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

        // Sending share tokens to the vault contract is always a mistake.
        require(receiver_ != address(this), "SHARE_SEND_VAULT");

        // Some contracts may attempt a preflight (e.g. Balancer) of a 0 amount
        // transfer.
        // We don't want to accidentally cause external errors due to zero
        // value transfers.
        if (
            amount_ > 0 &&
            // The sender and receiver lists bypass all access restrictions.
            !(isSender(sender_) || isReceiver(receiver_))
        ) {
            // Receivers act as "hubs" that can send to "spokes".
            // i.e. any address of the minimum tier.
            // Spokes cannot send tokens another "hop" e.g. to each other.
            // Spokes can only send back to a receiver (doesn't need to be
            // the same receiver they received from).
            require(isReceiver(sender_), "2SPOKE");
            require(
                TierReport.tierAtTimeFromReport(
                    tier.report(receiver_, new uint256[](0)),
                    block.timestamp
                ) >= minimumTier,
                "MIN_TIER"
            );
        }
    }
}