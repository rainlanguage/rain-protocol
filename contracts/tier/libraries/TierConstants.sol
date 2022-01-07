// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

/// @title TierConstants
/// @notice Constants for use with tier logic.
library TierConstants {
    /// Account has never held a tier.
    uint256 internal constant TIER_ZERO = 0;

    /// Magic number for tier one.
    uint internal constant TIER_ONE = 1;
    /// Magic number for tier two.
    uint internal constant TIER_TWO = 2;
    /// Magic number for tier three.
    uint internal constant TIER_THREE = 3;
    /// Magic number for tier four.
    uint internal constant TIER_FOUR = 4;
    /// Magic number for tier five.
    uint internal constant TIER_FIVE = 5;
    /// Magic number for tier six.
    uint internal constant TIER_SIX = 6;
    /// Magic number for tier seven.
    uint internal constant TIER_SEVEN = 7;
    /// Magic number for tier eight.
    uint internal constant TIER_EIGHT = 8;
}
