// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ITier } from "../tier/ITier.sol";
import { TierByConstructionClaim } from "../claim/TierByConstructionClaim.sol";

/// @title TierByConstructionClaimTest
/// A simple example showing how TierByConstruction can be used to gate a claim
/// on an erc20.
///
/// In this example users can mint 100 tokens for themselves if:
///
/// - They held `Tier.FOUR` at the time the claim contract is constructed
/// - They continue to hold `Tier.FOUR` until they claim
///
/// The user can increase their tier at any point but must never drop below
/// `Tier.FOUR` between the relevant blocks.
///
/// If a user holds `Tier.FOUR` at construction but forgets to claim before
/// they downgrade they can NOT claim.
///
/// This is just an example, the same basic principle can be applied to any
/// kind of mintable, including NFTs.
///
/// The main takeaways:
///
/// - Checking the tier is decoupled from granting it (ANY ITier set by the
///   constructor can authorize a claim)
/// - Claims are time sensitive against TWO blocks, for BOTH construction and
///   claim (NOT a snapshot)
/// - Users pay the gas and manage their own claim/mint (NOT an airdrop)
contract TierByConstructionClaimTest is ERC20, TierByConstructionClaim {
    /// Nothing special needs to happen in the constructor.
    /// Simply forward/set the desired ITier in the TierByConstruction
    /// constructor.
    /// @param tier_ The tier contract to mediate the validity of claims.
    constructor(ITier tier_)
        TierByConstructionClaim(tier_, ITier.Tier.FOUR)
        ERC20("goldTkn", "GTKN")
    { } // solhint-disable-line no-empty-blocks

    function _afterClaim(address account_, uint256, bytes memory)
        internal
        override
    {
        _mint(account_, 100);
    }
}