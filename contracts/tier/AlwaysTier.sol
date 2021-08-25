// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "./ReadOnlyTier.sol";

/// @title AlwaysTier
///
/// `AlwaysTier` is intended as a primitive for combining tier contracts.
///
/// As the name implies:
/// - `AlwaysTier` is `ReadOnlyTier` and so can never call `setTier`.
/// - `report` is always `0x00000000` for every tier and every address.
contract AlwaysTier is ReadOnlyTier {
    /// Every address is always every tier.
    /// @inheritdoc ITier
    function report(address) public override view returns (uint256) {
        return 0;
    }
}