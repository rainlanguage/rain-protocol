// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {ITier} from "../tier/ITier.sol";
import {TierByConstruction} from "../tier/TierByConstruction.sol";
import "../tier/libraries/TierConstants.sol";

/// @title TierByConstructionTest
/// An empty contract that facilitates tests enumerating behaviour of the
/// modifiers at each tier.
contract TierByConstructionTest is TierByConstruction {
    /// @param tier_ The tier contract for `TierByConstruction`.
    constructor(ITier tier_) {
        initializeTierByConstruction(tier_);
    }

    /// External function with no modifier to use as a control for testing.
    // solhint-disable-next-line no-empty-blocks
    function unlimited() external view {}

    /// Requires tier 0 to call.
    function ifZero()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_ZERO)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 1 to call.
    function ifOne()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_ONE)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 2 to call.
    function ifTwo()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_TWO)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 3 to call.
    function ifThree()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_THREE)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 4 to call.
    function ifFour()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_FOUR)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 5 to call.
    function ifFive()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_FIVE)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 6 to call.
    function ifSix()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_SIX)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 7 to call.
    function ifSeven()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_SEVEN)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// Requires tier 8 to call.
    function ifEight()
        external
        view
        onlyTier(msg.sender, TierConstants.TIER_EIGHT)
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
