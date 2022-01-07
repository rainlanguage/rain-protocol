// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {ValueTier} from "../tier/ValueTier.sol";
import {ITier} from "../tier/ITier.sol";

/// @title ValueTierTest
///
/// Thin wrapper around the `ValueTier` contract to facilitate hardhat unit
/// testing of `internal` functions.
contract ValueTierTest is ValueTier {
    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint256[8] memory tierValues_) {
        initializeValueTier(tierValues_);
    }

    /// Wraps `tierToValue`.
    function wrappedTierToValue(uint256 tier_) external view returns (uint256) {
        return ValueTier.tierToValue(tierValues(), tier_);
    }

    /// Wraps `valueToTier`.
    function wrappedValueToTier(uint256 value_)
        external
        view
        returns (uint256)
    {
        return ValueTier.valueToTier(tierValues(), value_);
    }
}
