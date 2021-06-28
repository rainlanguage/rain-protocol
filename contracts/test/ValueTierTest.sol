// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ValueTier } from "../tier/ValueTier.sol";
import { ITier } from "../tier/ITier.sol";

/// @title ValueTierTest
///
/// Thin wrapper around the `ValueTier` contract to facilitate hardhat unit testing of `internal` functions.
contract ValueTierTest is ValueTier {
    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint256[8] memory tierValues_) public ValueTier(tierValues_) { } // solhint-disable-line no-empty-blocks

    /// Complements the default solidity accessor for `tierValues`.
    /// Returns all the values in a list rather than requiring an index be specified.
    /// @return The immutable `tierValues`.
    // function getTierValues() external view returns(uint256[8] memory) {
    //     return ValueTier.getTierValues();
    // }

    /// Converts a Tier to the minimum value it requires.
    /// Tier ZERO is always value 0 as it is the fallback.
    function wrappedTierToValue(ITier.Tier tier_) external view returns(uint256) {
        return ValueTier.tierToValue(tier_);
    }

    /// Converts a value to the maximum Tier it qualifies for.
    function wrappedValueToTier(uint256 value_) external view  returns(ITier.Tier) {
        return ValueTier.valueToTier(value_);
    }
}