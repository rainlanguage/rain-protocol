// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// solhint-disable-next-line max-line-length
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
// solhint-disable-next-line max-line-length
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// solhint-disable-next-line max-line-length
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import { TierByConstruction } from "../tier/TierByConstruction.sol";
import { ITier } from "../tier/ITier.sol";

import { Phase, Phased } from "../phased/Phased.sol";

/// Everything required by the `RedeemableERC20` constructor.
struct RedeemableERC20Config {
    // Account that will be the admin for the `RedeemableERC20` contract.
    // Useful for factory contracts etc.
    address admin;
    // Name forwarded to ERC20 constructor.
    string name;
    // Symbol forwarded to ERC20 constructor.
    string symbol;
    // Tier contract to compare statuses against on transfer.
    ITier tier;
    // Minimum status required for transfers in `Phase.ZERO`. Can be `0`.
    ITier.Tier minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
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
/// The token can optionally be restricted by the `Tier` contract to only allow
/// receipients with a specified membership status.
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
///
/// The redeem functions MUST be used to redeem and burn RedeemableERC20s
/// (NOT regular transfers).
///
/// `redeem` will simply revert if called outside `Phase.ONE`.
/// A `Redeem` event is emitted on every redemption (per treasury asset) as
/// `(redeemer, asset, redeemAmount)`.
contract RedeemableERC20 is
    AccessControl,
    Phased,
    TierByConstruction,
    ERC20,
    ReentrancyGuard,
    ERC20Burnable
    {

    using SafeERC20 for IERC20;

    bytes32 public constant SENDER = keccak256("SENDER");
    bytes32 public constant RECEIVER = keccak256("RECEIVER");
    bytes32 public constant DISTRIBUTOR_BURNER =
        keccak256("DISTRIBUTOR_BURNER");

    /// Redeemable token added by creator.
    event TreasuryAsset(address indexed emitter, address indexed asset);

    /// Redeemable token burn for reserve.
    event Redeem(
        // Account burning and receiving.
        address indexed redeemer,
        // The treasury asset being sent to the burner.
        address indexed treasuryAsset,
        // The amounts of the redeemable and treasury asset as
        // `[redeemAmount, assetAmount]`
        uint256[2] redeemAmounts
    );

    /// RedeemableERC20 uses the standard/default 18 ERC20 decimals.
    /// The minimum supply enforced by the constructor is "one" token which is
    /// `10 ** 18`.
    /// The minimum supply does not prevent subsequent redemption/burning.
    uint256 public constant MINIMUM_INITIAL_SUPPLY = 10 ** 18;

    /// The minimum status that a user must hold to receive transfers during
    /// `Phase.ZERO`.
    /// The tier contract passed to `TierByConstruction` determines if
    /// the status is held during `_beforeTokenTransfer`.
    /// Not immutable because it is read during the constructor by the `_mint`
    /// call.
    ITier.Tier public minimumTier;

    /// Mint the full ERC20 token supply and configure basic transfer
    /// restrictions.
    /// @param config_ Constructor configuration.
    constructor (
        RedeemableERC20Config memory config_
    )
        ERC20(config_.name, config_.symbol)
        TierByConstruction(config_.tier)
    {
        require(
            config_.totalSupply >= MINIMUM_INITIAL_SUPPLY,
            "MINIMUM_INITIAL_SUPPLY"
        );
        minimumTier = config_.minimumStatus;

        _setupRole(DEFAULT_ADMIN_ROLE, config_.admin);
        _setupRole(RECEIVER, config_.admin);
        // Minting and burning must never fail.
        _setupRole(SENDER, address(0));
        _setupRole(RECEIVER, address(0));

        _mint(config_.admin, config_.totalSupply);
    }

    /// The admin can burn all tokens of a single address to end `Phase.ZERO`.
    /// The intent is that during `Phase.ZERO` there is some contract
    /// responsible for distributing the tokens.
    /// The admin specifies the distributor to end `Phase.ZERO` and all
    /// undistributed tokens are burned.
    /// The distributor is NOT set during the constructor because it likely
    /// doesn't exist at that point. For example, Balancer needs the paired
    /// erc20 tokens to exist before the trading pool can be built.
    /// @param distributorAccount_ The distributor according to the admin.
    function burnDistributor(address distributorAccount_)
        external
        onlyPhase(Phase.ZERO)
    {
        require(
            hasRole(DISTRIBUTOR_BURNER, msg.sender),
            "ONLY_DISTRIBUTOR_BURNER"
        );
        scheduleNextPhase(uint32(block.number));
        _burn(distributorAccount_, balanceOf(distributorAccount_));
    }

    /// Anyone can emit a `TreasuryAsset` event to notify token holders that
    /// an asset could be redeemed by burning `RedeemableERC20` tokens.
    /// As this is callable by anon the events should be filtered by the
    /// indexer to those from trusted entities only.
    function newTreasuryAsset(address newTreasuryAsset_) external {
        emit TreasuryAsset(msg.sender, newTreasuryAsset_);
    }

    /// Redeem (burn) tokens for treasury assets.
    /// Tokens can be redeemed but NOT transferred during `Phase.ONE`.
    ///
    /// Calculate the redeem value of tokens as:
    ///
    /// ```
    /// ( redeemAmount / redeemableErc20Token.totalSupply() )
    /// * token.balanceOf(address(this))
    /// ```
    ///
    /// This means that the users get their redeemed pro-rata share of the
    /// outstanding token supply burned in return for a pro-rata share of the
    /// current balance of each treasury asset.
    ///
    /// I.e. whatever % of redeemable tokens the sender burns is the % of the
    /// current treasury assets they receive.
    function redeem(
        IERC20[] memory treasuryAssets_,
        uint256 redeemAmount_
    )
        public
        onlyPhase(Phase.ONE)
        nonReentrant
    {
        // The fraction of the assets we release is the fraction of the
        // outstanding total supply of the redeemable burned.
        // Every treasury asset is released in the same proportion.
        uint256 supplyBeforeBurn_ = totalSupply();

        // Redeem __burns__ tokens which reduces the total supply and requires
        // no approval.
        // `_burn` reverts internally if needed (e.g. if burn exceeds balance).
        // This function is `nonReentrant` but we burn before redeeming anyway.
        _burn(msg.sender, redeemAmount_);

        for(uint256 i_ = 0; i_ < treasuryAssets_.length; i_++) {
            IERC20 ithRedeemable_ = treasuryAssets_[i_];
            uint256 assetAmount_
                = ( ithRedeemable_.balanceOf(address(this)) * redeemAmount_ )
                / supplyBeforeBurn_;
            emit Redeem(
                msg.sender,
                address(ithRedeemable_),
                [redeemAmount_, assetAmount_]
            );
            ithRedeemable_.safeTransfer(
                msg.sender,
                assetAmount_
            );
        }
    }

    /// Sanity check to ensure `Phase.ONE` is the final phase.
    /// @inheritdoc Phased
    // Slither false positive. This is overriding an Open Zeppelin hook.
    // https://github.com/crytic/slither/issues/929
    // slither-disable-next-line dead-code
    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_)
        internal
        override
        virtual
    {
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        assert(currentPhase() < Phase.TWO);
    }

    /// Apply phase sensitive transfer restrictions.
    /// During `Phase.ZERO` only tier requirements apply.
    /// During `Phase.ONE` all transfers except burns are prevented.
    /// If a transfer involves either a sender or receiver with the relevant
    /// `unfreezables` state it will ignore these restrictions.
    /// @inheritdoc ERC20
    // Slither false positive. This is overriding an Open Zeppelin hook.
    // https://github.com/crytic/slither/issues/929
    // slither-disable-next-line dead-code
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    )
        internal
        override
        virtual
    {
        super._beforeTokenTransfer(sender_, receiver_, amount_);

        // Sending tokens to this contract (e.g. instead of redeeming) is
        // always an error.
        require(receiver_ != address(this), "TOKEN_SEND_SELF");

        // Some contracts may attempt a preflight (e.g. Balancer) of a 0 amount
        // transfer.
        // We don't want to accidentally cause external errors due to zero
        // value transfers.
        if (amount_ > 0
            // The sender and receiver lists bypass all access restrictions.
            && !(hasRole(SENDER, sender_) || hasRole(RECEIVER, receiver_))) {
            // During `Phase.ZERO` transfers are only restricted by the
            // tier of the recipient.
            if (currentPhase() == Phase.ZERO) {
                require(
                    isTier(receiver_, minimumTier),
                    "MIN_TIER"
                );
            }
            // During `Phase.ONE` only token burns are allowed.
            else if (currentPhase() == Phase.ONE) {
                require(receiver_ == address(0), "FROZEN");
            }
            // There are no other phases.
            else { assert(false); }
        }
    }
}
