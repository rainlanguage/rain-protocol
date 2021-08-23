// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/// @title TierByConstructionClaim
/// Contract that can be inherited by anything that wants to manage claims of erc20/721/1155/etc. based on tier.
/// The tier must be held continously since the contract construction according to the tier contract.
contract TierByConstructionClaim is TierByConstruction {
    /// The minimum tier required for an address to claim anything at all.
    /// This tier must have been held continuously since before this contract was constructed.
    ITier.Tier public immutable minimumTier;

    /// Tracks every address that has already claimed to prevent duplicate claims.
    mapping(address => bool) public claims;

    /// A claim has been successfully processed for an account.
    event Claim(address indexed account, bytes data_);

    /// Nothing special needs to happen in the constructor.
    /// Simply forwards the desired ITier contract in the TierByConstruction constructor.
    /// The minimum tier is set for later reference.
    constructor(ITier tierContract_, ITier.Tier minimumTier_)
        public
        TierByConstruction(tierContract_)
    {
        minimumTier = minimumTier_;
    }

    /// The onlyTier modifier checks the claimant against minimumTier.
    /// The ITier contract decides for itself whether the claimant is minimumTier as at the current block.number
    /// The claim can only be done once per account.
    ///
    /// NOTE: This function is callable by anyone and can only be called once per account.
    /// The `_afterClaim` function can and SHOULD enforce additional restrictions on when/how a claim is valid.
    /// Be very careful to manage griefing attacks when the `msg.sender` is not `account_`, for example:
    /// - An `ERC20BalanceTier` has no historical information so anyone can claim for anyone else based on their balance at any time.
    /// - `data_` may be set arbitrarily by `msg.sender` so could be consumed frivilously at the expense of `account_`.
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
        // Inheriting contracts will need to override this to make the claim useful.
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