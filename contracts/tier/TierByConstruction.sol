// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { TierUtil } from "../libraries/TierUtil.sol";
import { ITier } from "./ITier.sol";

/// @title TierByConstruction
/// @notice `TierByConstruction` is a base contract for other
/// contracts to inherit from.
///
/// It exposes `isTier` and the corresponding modifier `onlyTier`.
///
/// This ensures that the address has held at least the given tier
/// since the contract was constructed.
///
/// We check against the construction time of the contract rather
/// than the current block to avoid various exploits.
///
/// Users should not be able to gain a tier for a single block, claim
/// benefits then remove the tier within the same block.
///
/// The construction block provides a simple and generic reference
/// point that is difficult to manipulate/predict.
///
/// Note that `ReadOnlyTier` contracts must carefully consider use
/// with `TierByConstruction` as they tend to return `0x00000000` for
/// any/all tiers held. There needs to be additional safeguards to
/// mitigate "flash tier" attacks.
///
/// Note that an account COULD be `TierByConstruction` then lower/
/// remove a tier, then no longer be eligible when they regain the
/// tier. Only _continuously held_ tiers are valid against the
/// construction block check as this is native behaviour of the
/// `report` function in `ITier`.
///
/// Technically the `ITier` could re-enter the `TierByConstruction`
/// so the `onlyTier` modifier runs AFTER the modified function.
///
/// @dev Enforces tiers held by contract contruction block.
/// The construction block is compared against the blocks returned by `report`.
/// The `ITier` contract is paramaterised and set during construction.
contract TierByConstruction {
    ITier public tierContract;
    uint256 public constructionBlock;

    constructor(ITier tierContract_) public {
        tierContract = tierContract_;
        constructionBlock = block.number;
    }

    /// Check if an account has held AT LEAST the given tier according to
    /// `tierContract` since construction.
    /// The account MUST have held the tier continuously from construction
    /// until the "current" state according to `report`.
    /// Note that `report` PROBABLY is current as at the block this function is
    /// called but MAYBE NOT.
    /// The `ITier` contract is free to manage reports however makes sense.
    ///
    /// @param account_ Account to check status of.
    /// @param minimumTier_ Minimum tier for the account.
    /// @return True if the status is currently held.
    function isTier(address account_, ITier.Tier minimumTier_)
        public
        view
        returns (bool)
    {
        return constructionBlock >= TierUtil.tierBlock(
            tierContract.report(account_),
            minimumTier_
        );
    }

    /// Modifier that restricts access to functions depending on the tier
    /// required by the function.
    ///
    /// `isTier` involves an external call to tierContract.report.
    /// `require` happens AFTER the modified function to avoid rentrant
    /// `ITier` code.
    /// Also `report` from `ITier` is `view` so the compiler will error on
    /// attempted state modification.
    // solhint-disable-next-line max-line-length
    /// https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks
    ///
    /// Do NOT use this to guard setting the tier on an `ITier` contract.
    /// The initial tier would be checked AFTER it has already been
    /// modified which is unsafe.
    ///
    /// @param account_ Account to enforce tier of.
    /// @param minimumTier_ Minimum tier for the account.
    modifier onlyTier(address account_, ITier.Tier minimumTier_) {
        _;
        require(
            isTier(account_, minimumTier_),
            "MINIMUM_TIER"
        );
    }
}