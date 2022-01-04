// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/// @title TierByConstructionTest
/// An empty contract that facilitates tests enumerating behaviour of the
/// modifiers at each tier.
contract TierByConstructionTest is TierByConstruction {

    /// @param tier_ The tier contract for `TierByConstruction`.
    constructor(ITier tier_) {
        initialize(tier_);
    }

    /// External function with no modifier to use as a control for testing.
    function unlimited()
        external
        view
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 0 to call.
    function ifZero()
        external
        view
        onlyTier(msg.sender, 0)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 1 to call.
    function ifOne()
        external
        view
        onlyTier(msg.sender, 1)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 2 to call.
    function ifTwo()
        external
        view
        onlyTier(msg.sender, 2)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 3 to call.
    function ifThree()
        external
        view
        onlyTier(msg.sender, 3)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 4 to call.
    function ifFour()
        external
        view
        onlyTier(msg.sender, 4)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 5 to call.
    function ifFive()
        external
        view
        onlyTier(msg.sender, 5)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 6 to call.
    function ifSix()
        external
        view
        onlyTier(msg.sender, 6)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 7 to call.
    function ifSeven()
        external
        view
        onlyTier(msg.sender, 7)
    { } // solhint-disable-line no-empty-blocks

    /// Requires tier 8 to call.
    function ifEight()
        external
        view
        onlyTier(msg.sender, 8)
    { } // solhint-disable-line no-empty-blocks
}