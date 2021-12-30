// SPDX-License-Identifier: CAL

pragma solidity ^0.8.10;

import { ITier } from "./ITier.sol";

/// @title ValueTier
///
/// @dev A contract that is `ValueTier` expects to derive tiers from explicit
/// values. For example an address must send or hold an amount of something to
/// reach a given tier.
/// Anything with predefined values that map to tiers can be a `ValueTier`.
///
/// Note that `ValueTier` does NOT implement `ITier`.
/// `ValueTier` does include state however, to track the `tierValues` so is not
/// a library.
contract ValueTier {
    uint private immutable tierOne;
    uint private immutable tierTwo;
    uint private immutable tierThree;
    uint private immutable tierFour;
    uint private immutable tierFive;
    uint private immutable tierSix;
    uint private immutable tierSeven;
    uint private immutable tierEight;

    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint[8] memory tierValues_) {
        tierOne = tierValues_[0];
        tierTwo = tierValues_[1];
        tierThree = tierValues_[2];
        tierFour = tierValues_[3];
        tierFive = tierValues_[4];
        tierSix = tierValues_[5];
        tierSeven = tierValues_[6];
        tierEight = tierValues_[7];
    }

    /// Complements the default solidity accessor for `tierValues`.
    /// Returns all the values in a list rather than requiring an index be
    /// specified.
    /// @return tierValues_ The immutable `tierValues`.
    function tierValues() public view returns(uint[8] memory tierValues_) {
        tierValues_[0] = tierOne;
        tierValues_[1] = tierTwo;
        tierValues_[2] = tierThree;
        tierValues_[3] = tierFour;
        tierValues_[4] = tierFive;
        tierValues_[5] = tierSix;
        tierValues_[6] = tierSeven;
        tierValues_[7] = tierEight;
        return tierValues_;
    }

    /// Converts a Tier to the minimum value it requires.
    /// `Tier.ZERO` is always value 0 as it is the fallback.
    /// @param tier_ The Tier to convert to a value.
    function tierToValue(uint tier_) internal view returns(uint) {
        return tier_ > 0 ? tierValues()[tier_ - 1] : 0;
    }

    /// Converts a value to the maximum Tier it qualifies for.
    /// @param value_ The value to convert to a Tier.
    function valueToTier(uint value_) internal view returns(uint) {
        for (uint256 i_ = 0; i_ < 8; i_++) {
            if (value_ < tierValues()[i_]) {
                return i_;
            }
        }
        return 8;
    }
}