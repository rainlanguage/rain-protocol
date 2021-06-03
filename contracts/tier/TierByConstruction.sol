// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { TierUtil } from "./TierUtil.sol";
import { ITier } from "./ITier.sol";

/**
 * Enforces tiers held by contract contruction block.
 * The construction block is compared against the blocks returned by `report`.
 * The `ITier` contract is paramaterised and set during construction.
 */
contract TierByConstruction {
    ITier public tierContract;
    uint256 public constructionBlock;

    constructor(ITier _tierContract) public {
        tierContract = _tierContract;
        constructionBlock = block.number;
    }

    /**
     * Check if an account has held AT LEAST the given tier according to `tierContract` since construction.
     * The account MUST have held the tier continuously from construction until the "current" state according to `report`.
     * Note that `report` PROBABLY is current as at the block this function is called but MAYBE NOT.
     * The `ITier` contract is free to manage reports however makes sense to it.
     *
     * @param _account Account to check status of.
     * @param _minimumTier Minimum tier for the account.
     * @return True if the status is currently held.
     */
    function isTier(address _account, ITier.Tier _minimumTier)
        public
        view
        returns (bool)
    {
        uint256 _report = tierContract.report(_account);
        uint256 _minimumTierBlock = TierUtil.tierBlock(_report, uint256(_minimumTier));
        return _minimumTierBlock < constructionBlock;
    }

    /**
     * Modifier that restricts access to functions depending on the tier required by the function.
     *
     * `isTier` involves an external call to tierContract.report.
     * `require` happens AFTER the modified function to avoid rentrant `ITier` code.
     * Also `report` from `ITier` is `view` so the compiler will error on attempted state modification.
     * https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks
     *
     * Do NOT use this to guard setting the tier on an ITier contract.
     * The initial tier would be checked AFTER it has already been modified which is unsafe.
     *
     * @param _account Account to enforce tier of.
     * @param _minimumTier Minimum tier for the account.
     */
    modifier onlyTier(address _account, ITier.Tier _minimumTier) {
        _;
        require(
            isTier(_account, _minimumTier),
            "ERR_MINIMUM_TIER"
        );
    }
}