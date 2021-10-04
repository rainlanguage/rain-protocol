// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import {
    AccessControl
} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    ERC20Burnable
} from "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

import {
    TierByConstruction
} from "../tier/TierByConstruction.sol";
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
/// Up to 8 redeemable tokens can be registered on the redeemable contract.
/// These will be looped over by default in the `redeem` function. If there is
/// an error during redemption or more than 8 tokens are to be redeemed, there
/// is a `redeemSpecific` function that allows the caller to specify exactly
/// which of the redeemable tokens they want to receive.
/// Note: The same amount of `RedeemableERC20` is burned, regardless of which
/// redeemable tokens were specified. Specifying fewer redeemable tokens will
/// NOT increase the proportion of each that is returned. `redeemSpecific` is
/// intended as a last resort if the caller cannot resolve issues causing
/// errors for one or more redeemable tokens during redemption.
///
/// `RedeemableERC20` has several owner administrative functions:
/// - Owner can add senders and receivers that can send/receive tokens even
///   during `Phase.ONE`
/// - Owner can add to the list of redeemable tokens
///   - But NOT remove them
///   - And everyone can call `redeemSpecific` to override the redeemable list
/// - Owner can end `Phase.ONE` during `Phase.ZERO` by specifying the address
///   of a distributor, which will have any undistributed tokens burned.
///
/// The intent is that the redeemable token contract is owned by a `Trust`
/// contract, NOT an externally owned account. The `Trust` contract will add
/// the minimum possible senders/receivers to facilitate the AMM trading and
/// redemption.
///
/// The `Trust` will also control access to managing redeemable tokens and
/// specifying the trading AMM pool as the distributor to burn to end
/// `Phase.ONE`.
///
/// The redeem functions MUST be used to redeem and burn RedeemableERC20s
/// (NOT regular transfers).
///
/// The `redeem` and `redeemSpecific` functions will simply revert if called
/// outside `Phase.ONE`.
/// A `Redeem` event is emitted on every redemption (per redeemed token) as
/// `(redeemer, redeemable, redeemAmount)`.
contract RedeemableERC20 is
    AccessControl,
    Phased,
    TierByConstruction,
    ERC20,
    ReentrancyGuard,
    ERC20Burnable
    {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant SENDER = keccak256("SENDER");
    bytes32 public constant RECEIVER = keccak256("RECEIVER");
    bytes32 public constant DISTRIBUTOR_BURNER =
        keccak256("DISTRIBUTOR_BURNER");
    bytes32 public constant REDEEMABLE_ADDER = keccak256("REDEEMABLE_ADDER");

    /// Redeemable token burn for reserve.
    event Redeem(
        // Account burning and receiving.
        address indexed redeemer,
        // The token being sent to the burner.
        address indexed redeemable,
        // The amount of the redeemable and token being redeemed as
        // `[redeemAmount, tokenAmount]`
        uint256[2] redeemAmounts
    );

    /// RedeemableERC20 uses the standard/default 18 ERC20 decimals.
    /// The minimum supply enforced by the constructor is "one" token which is
    /// `10 ** 18`.
    /// The minimum supply does not prevent subsequent redemption/burning.
    uint256 public constant MINIMUM_INITIAL_SUPPLY = 10 ** 18;

    /// The maximum number of redeemables that can be set.
    /// Attempting to add more redeemables than this will fail with an error.
    /// This prevents a very large loop in the default redemption behaviour.
    uint8 public constant MAX_REDEEMABLES = 8;

    /// @dev List of redeemables to loop over in default redemption behaviour.
    /// see `getRedeemables`.
    IERC20[] private redeemables;

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
        public
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

    /// Admin can add up to 8 redeemables to this contract.
    /// Each redeemable will be sent to token holders when they call redeem
    /// functions in `Phase.ONE` to burn tokens.
    /// If the admin adds a non-compliant or malicious IERC20 address then
    /// token holders can override the list with `redeemSpecific`.
    /// @param newRedeemable_ The redeemable contract address to add.
    function addRedeemable(IERC20 newRedeemable_) external {
        require(
            hasRole(REDEEMABLE_ADDER, msg.sender),
            "ONLY_REDEEMABLE_ADDER"
        );
        // Somewhat arbitrary but we limit the length of redeemables to 8.
        // 8 is actually a lot. Consider that every `redeem` call must loop a
        // `balanceOf` and `safeTransfer` per redeemable.
        require(redeemables.length<MAX_REDEEMABLES, "MAX_REDEEMABLES");
        for (uint256 i_ = 0; i_<redeemables.length;i_++) {
            require(redeemables[i_] != newRedeemable_, "DUPLICATE_REDEEMABLE");
        }
        redeemables.push(newRedeemable_);
    }

    /// Public getter for underlying registered redeemables as a fixed sized
    /// array.
    /// The underlying array is dynamic but fixed size return values provide
    /// clear bounds on gas etc.
    /// @return Dynamic `redeemables` mapped to a fixed size array.
    function getRedeemables() external view returns (address[8] memory) {
        // Slither false positive here due to a bug in slither.
        // https://github.com/crytic/slither/issues/884
        // slither-disable-next-line uninitialized-local
        address[8] memory redeemablesArray_;
        for(uint256 i_ = 0;i_<redeemables.length;i_++) {
            redeemablesArray_[i_] = address(redeemables[i_]);
        }
        return redeemablesArray_;
    }

    /// Redeem tokens.
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
    /// current balance of each redeemable token.
    ///
    /// I.e. whatever % of redeemable tokens the sender burns is the % of the
    /// current reserve they receive.
    ///
    /// Note: Any tokens held by `address(0)` are burned defensively.
    ///       This is because transferring directly to `address(0)` will
    ///       succeed but the `totalSupply` won't reflect it.
    function redeemSpecific(
        IERC20[] memory specificRedeemables_,
        uint256 redeemAmount_
    )
        public
        onlyPhase(Phase.ONE)
        nonReentrant
    {
        // The fraction of the redeemables we release is the fraction of the
        // outstanding total supply passed in.
        // Every redeemable is released in the same proportion.
        uint256 supplyBeforeBurn_ = totalSupply();

        // Redeem __burns__ tokens which reduces the total supply and requires
        // no approval.
        // `_burn` reverts internally if needed (e.g. if burn exceeds balance).
        // This function is `nonReentrant` but we burn before redeeming anyway.
        _burn(msg.sender, redeemAmount_);

        for(uint256 i_ = 0; i_ < specificRedeemables_.length; i_++) {
            IERC20 ithRedeemable_ = specificRedeemables_[i_];
            uint256 tokenAmount_ = ithRedeemable_
                .balanceOf(address(this))
                .mul(redeemAmount_)
                .div(supplyBeforeBurn_);
            emit Redeem(
                msg.sender,
                address(ithRedeemable_),
                [redeemAmount_, tokenAmount_]
            );
            ithRedeemable_.safeTransfer(
                msg.sender,
                tokenAmount_
            );
        }
    }

    /// Default redemption behaviour.
    /// Thin wrapper for `redeemSpecific`.
    /// `msg.sender` specifies an amount of their own redeemable token to
    /// redeem.
    /// Each redeemable token specified by this contract's admin will be sent
    /// to the sender pro-rata.
    /// The sender's tokens are burned in the process.
    /// @param redeemAmount_ The amount of the sender's redeemable erc20 to
    /// burn.
    function redeem(uint256 redeemAmount_) external {
        redeemSpecific(redeemables, redeemAmount_);
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
