// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";

/// @title ValueTier
///
/// A contract that is `ValueTier` expects to derive tiers from explicit values.
/// For example an address must send or hold an amount of something to reach a given tier.
/// Anything with predefined values that map to tiers can be a `ValueTier`.
///
/// Note that `ValueTier` does NOT implement `ITier`.
/// `ValueTier` does include state however, to track the `tierValues` so is not a library.
contract ValueTier {
    uint256[8] public tierValues;

    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint256[8] memory tierValues_) public {
        tierValues = tierValues_;
    }

    /// Complements the default solidity accessor for `tierValues`.
    /// Returns all the values in a list rather than requiring an index be specified.
    /// @return The immutable `tierValues`.
    function getTierValues() external view returns(uint256[8] memory) {
        return tierValues;
    }

    /// Converts a Tier to the minimum value it requires.
    /// Tier ZERO is always value 0 as it is the fallback.
    function tierToValue(ITier.Tier tier_) internal view returns(uint256) {
        return tier_ > ITier.Tier.ZERO ? tierValues[uint256(tier_) - 1] : 0;
    }

    /// Converts a value to the maximum Tier it qualifies for.
    function valueToTier(uint256 value_) internal view returns(ITier.Tier) {
        for (uint256 i = 0; i < 8; i++) {
            if (value_ < tierValues[i]) {
                return ITier.Tier(i);
            }
        }
        return ITier.Tier.EIGHT;
    }
}