// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/**
 * A simple example showing how TierByConstruction can be used to gate a claim on an ERC20.
 *
 * In this example users can mint 100 tokens for themselves if:
 *
 * - They held FOUR at the time the claim contract is constructed
 * - They continue to hold tier FOUR until they claim
 *
 * The user can increase their tier at any point but must never drop below FOUR between the relevant blocks.
 *
 * If a user holds FOUR at construction but forgets to claim before they downgrade they can NOT claim.
 *
 * This is just an example, the same basic principle can be applied to any kind of mintable, including NFTs.
 *
 * The main takeaways:
 *
 * - Checking the prestige level is decoupled from granting it (ANY ITier set by the constructor can authorize a claim)
 * - Claims are time sensitive against TWO blocks, for BOTH construction and claim (NOT a snapshot)
 * - Users pay the gas and manage their own claim/mint (NOT an airdrop)
 */
contract TierByConstructionClaimTest is ERC20, TierByConstruction {

    mapping(address => bool) public claims;

    /**
     * Nothing special needs to happen in the constructor.
     * Simply forward/set the desired ITier in the TierByConstruction constructor.
     * The ERC20 constructor is as per Open Zeppelin.
     */
    constructor(ITier tier_)
        public
        TierByConstruction(tier_)
        ERC20("goldTkn", "GTKN")
    { } // solhint-disable-line no-empty-blocks

    /**
     * The onlyTier modifier checks the claimant against tier FOUR.
     * The ITier contract decides for itself whether the claimant is FOUR as at the current block.number
     * The claim can only be done once per account.
     */
    function claim(address account_)
        external
        onlyTier(account_, ITier.Tier.FOUR)
    {
        require(!claims[account_], "MULTI_MINT");
        claims[account_] = true;
        super._mint(account_, 100);
    }
}