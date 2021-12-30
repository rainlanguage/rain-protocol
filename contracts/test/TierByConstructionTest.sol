// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Tier, ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/// @title TierByConstructionTest
/// An empty contract that facilitates tests enumerating behaviour of the
/// modifiers at each tier.
contract TierByConstructionTest is TierByConstruction {

    /// @param tier_ The tier contract for `TierByConstruction`.
    constructor(ITier tier_)
        TierByConstruction(tier_) { } // solhint-disable-line no-empty-blocks

    /// External function with no modifier to use as a control for testing.
    function unlimited()
        external
        view
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.ZERO` to call.
    function ifZero()
        external
        view
        onlyTier(msg.sender, Tier.ZERO)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.ONE` to call.
    function ifOne()
        external
        view
        onlyTier(msg.sender, Tier.ONE)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.TWO` to call.
    function ifTwo()
        external
        view
        onlyTier(msg.sender, Tier.TWO)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.THREE` to call.
    function ifThree()
        external
        view
        onlyTier(msg.sender, Tier.THREE)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.FOUR` to call.
    function ifFour()
        external
        view
        onlyTier(msg.sender, Tier.FOUR)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.FIVE` to call.
    function ifFive()
        external
        view
        onlyTier(msg.sender, Tier.FIVE)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.SIX` to call.
    function ifSix()
        external
        view
        onlyTier(msg.sender, Tier.SIX)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.SEVEN` to call.
    function ifSeven()
        external
        view
        onlyTier(msg.sender, Tier.SEVEN)
    { } // solhint-disable-line no-empty-blocks

    /// Requires `Tier.EIGHT` to call.
    function ifEight()
        external
        view
        onlyTier(msg.sender, Tier.EIGHT)
    { } // solhint-disable-line no-empty-blocks
}