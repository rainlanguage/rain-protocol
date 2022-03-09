// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {ITier} from "./ITier.sol";
import {TierReport} from "./libraries/TierReport.sol";

/// @title ReadOnlyTier
/// @notice `ReadOnlyTier` is a base contract that other contracts
/// are expected to inherit.
///
/// It does not allow `setStatus` and expects `report` to derive from
/// some existing onchain data.
///
/// @dev A contract inheriting `ReadOnlyTier` cannot call `setTier`.
///
/// `ReadOnlyTier` is abstract because it does not implement `report`.
/// The expectation is that `report` will derive tiers from some
/// external data source.
abstract contract ReadOnlyTier is ITier {
    /// Always reverts because it is not possible to set a read only tier.
    /// @inheritdoc ITier
    function setTier(
        address,
        uint256,
        bytes calldata
    ) external pure override {
        revert("SET_TIER");
    }
}
