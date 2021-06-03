// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "./ReadOnlyTier.sol";

contract NeverTier is ReadOnlyTier {
    function report(address) public override view returns (uint256) {
        return uint256(-1);
    }
}