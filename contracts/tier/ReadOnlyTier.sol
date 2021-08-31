// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";
import { TierUtil } from "../libraries/TierUtil.sol";

/// @title ReadOnlyTier
///
/// A contract inheriting `ReadOnlyTier` cannot call `setTier`.
///
/// `ReadOnlyTier` is abstract because it does not implement `report`.
/// The expectation is that `report` will derive tiers from some external data source.
abstract contract ReadOnlyTier is ITier {
    /// Always reverts because it is not possible to set a read only tier.
    /// @inheritdoc ITier
    function setTier(
        address,
        Tier,
        bytes memory
    )
        external override
    {
        revert("SET_TIER");
    }
}