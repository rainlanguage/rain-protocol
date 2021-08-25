// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "./ReadOnlyTier.sol";

/// @title NeverTier
///
/// `NeverTier` is intended as a primitive for combining tier contracts.
///
/// As the name implies:
/// - `NeverTier` is `ReadOnlyTier` and so can never call `setTier`.
/// - `report` is always `uint256(-1)` as every tier is unobtainable.
contract NeverTier is ReadOnlyTier {
    /// Every tier in the report is unobtainable.
    /// @inheritdoc ITier
    function report(address) public override view returns (uint256) {
        return uint256(-1);
    }
}