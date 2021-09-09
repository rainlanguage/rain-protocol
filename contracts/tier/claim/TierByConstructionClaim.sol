// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ITier } from "../ITier.sol";
import { TierByConstruction } from "../TierByConstruction.sol";

/// @title TierByConstructionClaim
/// @notice `TierByConstructionClaim` is a base contract for other
/// contracts to inherit from.
///
/// It builds on `TierByConstruction` with a `claim` function and
/// `_afterClaim` hook.
///
/// The `claim` function checks `onlyTier` and exposes `isTier` for
/// `_afterClaim` hooks so that accounts can self-mint rewards such
/// as erc20, erc1155, erc721, etc. if they meet the tier requirements.
///
/// The `claim` function can only be called once per account.
///
/// Note that `claim` is an unrestricted function and only the tier
/// of the _recipient_ is checked.
///
/// Implementing contracts must be careful to avoid griefing attacks
/// where an attacker calls `claim` against a third party in such a
/// way that their reward is minimised or damaged in some way.
///
/// For example, `ERC20BalanceTier` used with
/// `TierByConstructionClaim` opens the ability for an attacker to
/// `claim` every address they know that has not reached the minimum
/// balance, permanently voiding that address for future claims even
/// if they reach the minimum balance at a later date.
///
/// Another example, `data_` is set to some empty value for the
/// `claim` that voids the ability for the recipient to receive more
/// rewards, had the `data_` been set to some meaningful value.
///
/// Implementing contracts are encouraged to include additional
/// restrictions such as requiring the `msg.sender` and claimant are
/// the same address, or preapproved by the recipient, if griefing
/// attacks are possible.
///
/// @dev Contract that can be inherited by anything that wants to
/// manage claims of erc20/721/1155/etc. based on tier.
/// The tier must be held continously since the contract construction
/// according to the tier contract.
contract TierByConstructionClaim is TierByConstruction {
    /// The minimum tier required for an address to claim anything at all.
    /// This tier must have been held continuously since before this
    /// contract was constructed.
    ITier.Tier public immutable minimumTier;

    /// Tracks every address that has already claimed to prevent
    /// duplicate claims.
    mapping(address => bool) public claims;

    /// A claim has been successfully processed for an account.
    event Claim(address indexed account, bytes data_);

    /// Nothing special needs to happen in the constructor.
    /// Simply forwards the desired ITier contract in the
    /// TierByConstruction constructor.
    /// The minimum tier is set for later reference.
    constructor(ITier tierContract_, ITier.Tier minimumTier_)
        public
        TierByConstruction(tierContract_)
    {
        minimumTier = minimumTier_;
    }

    /// The onlyTier modifier checks the claimant against minimumTier.
    /// The ITier contract decides for itself whether the claimant is
    /// minimumTier as at the current block.number
    /// The claim can only be done once per account.
    ///
    /// NOTE: This function is callable by anyone and can only be
    /// called once per account.
    /// The `_afterClaim` function can and SHOULD enforce additional
    /// restrictions on when/how a claim is valid.
    /// Be very careful to manage griefing attacks when the `msg.
    /// sender` is not `account_`, for example:
    /// - An `ERC20BalanceTier` has no historical information so
    /// anyone can claim for anyone else based on their balance at any time.
    /// - `data_` may be set arbitrarily by `msg.sender` so could be
    /// consumed frivilously at the expense of `account_`.
    ///
    /// @param account_ The account that receives the benefits of the claim.
    /// @param data_ Additional data that may inform the claim process.
    function claim(address account_, bytes memory data_)
        external
        onlyTier(account_, minimumTier)
    {
        // Prevent duplicate claims for a given account.
        require(!claims[account_], "DUPLICATE_CLAIM");

        // Record that a claim has been made for this account.
        claims[account_] = true;

        // Log the claim.
        emit Claim(account_, data_);

        // Process the claim.
        // Inheriting contracts will need to override this to make
        // the claim useful.
        _afterClaim(account_, tierContract.report(account_), data_);
    }

    /// Implementing contracts need to define what is claimed.
    function _afterClaim(
        address account_,
        uint256 report_,
        bytes memory data_
    )
        internal virtual
    { } // solhint-disable-line no-empty-blocks
}