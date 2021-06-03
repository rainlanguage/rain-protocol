// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "./ReadOnlyTier.sol";

contract AlwaysTier is ReadOnlyTier {
    // Users are always AlwaysTier for every tier.
    function report(address) public override view returns (uint256) {
        return 0;
    }
}