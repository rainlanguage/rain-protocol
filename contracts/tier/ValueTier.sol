// SPDX-License-Identifier: CAL

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
    uint256 private immutable tierOne;
    uint256 private immutable tierTwo;
    uint256 private immutable tierThree;
    uint256 private immutable tierFour;
    uint256 private immutable tierFive;
    uint256 private immutable tierSix;
    uint256 private immutable tierSeven;
    uint256 private immutable tierEight;

    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint256[8] memory tierValues_) public {
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
    /// Returns all the values in a list rather than requiring an index be specified.
    /// @return tierValues_ The immutable `tierValues`.
    function tierValues() public view returns(uint256[8] memory tierValues_) {
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
    /// Tier ZERO is always value 0 as it is the fallback.
    function tierToValue(ITier.Tier tier_) internal view returns(uint256) {
        return tier_ > ITier.Tier.ZERO ? tierValues()[uint256(tier_) - 1] : 0;
    }

    /// Converts a value to the maximum Tier it qualifies for.
    function valueToTier(uint256 value_) internal view returns(ITier.Tier) {
        for (uint256 i = 0; i < 8; i++) {
            if (value_ < tierValues()[i]) {
                return ITier.Tier(i);
            }
        }
        return ITier.Tier.EIGHT;
    }
}