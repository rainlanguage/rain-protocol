// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/// A simple example showing how TierByConstruction can be used to gate a claim on an ERC20.
///
/// In this example users can mint 100 tokens for themselves if:
///
/// - They held THREE at the time the claim contract is constructed
/// - They continue to hold THREE status until they claim
///
/// The user can increase their status at any point but must never drop below THREE between the relevant blocks.
///
/// If a user holds THREE at construction but forgets to claim before they downgrade they can NOT claim.
///
/// This is just an example, the same basic principle can be applied to any kind of mintable, including NFTs.
///
/// The main takeaways:
///
/// - Checking the prestige level is decoupled from granting it (ANY ITier set by the constructor can authorize a claim)
/// - Claims are time sensitive against TWO blocks, for BOTH construction and claim (NOT a snapshot)
/// - Users pay the gas and manage their own claim/mint (NOT an airdrop)
contract TierByConstructionClaim is TierByConstruction {
    ITier.Tier public minimumTier;
    mapping(address => bool) public claims;

    event Claim(address account);

    /// Nothing special needs to happen in the constructor.
    /// Simply forward/set the desired ITier in the TierByConstruction constructor.
    /// The ERC20 constructor is as per Open Zeppelin.
    constructor(ITier tierContract_, ITier.Tier minimumTier_)
        public
        TierByConstruction(tierContract_)
    {
        minimumTier = minimumTier_;
    }

    /// The onlyTier modifier checks the claimant against FOUR status.
    /// The ITier contract decides for itself whether the claimant is FOUR as at the current block.number
    /// The claim can only be done once per account.
    function claim(address account_, bytes memory data_)
        external
        onlyTier(account_, minimumTier)
    {
        require(!claims[account_], "ERR_DUPLICATE_CLAIM");
        claims[account_] = true;
        emit Claim(account_);

        _afterClaim(account_, tierContract.report(account_), data_);
    }

    function _afterClaim(
        address account_,
        uint256 report_,
        bytes memory data_
    )
        internal virtual
    { } // solhint-disable-line no-empty-blocks
}