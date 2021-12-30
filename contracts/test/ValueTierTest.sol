// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ValueTier } from "../tier/ValueTier.sol";
import { ITier } from "../tier/ITier.sol";

/// @title ValueTierTest
///
/// Thin wrapper around the `ValueTier` contract to facilitate hardhat unit
/// testing of `internal` functions.
contract ValueTierTest is ValueTier {
    /// Set the `tierValues` on construction to be referenced immutably.
    constructor(uint[8] memory tierValues_)
        ValueTier(tierValues_)
    { } // solhint-disable-line no-empty-blocks

    /// Wraps `tierToValue`.
    function wrappedTierToValue(uint tier_)
        external
        view
        returns(uint)
    {
        return ValueTier.tierToValue(tier_);
    }

    /// Wraps `valueToTier`.
    function wrappedValueToTier(uint value_)
        external
        view
        returns(uint)
    {
        return ValueTier.valueToTier(value_);
    }
}