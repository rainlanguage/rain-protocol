// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../memory/LibMemorySize.sol";

/// @title LibMemorySizeTest
/// Thin wrapper around `LibMemorySize` library exposing methods for testing
contract LibMemorySizeTest {
    function size(uint256 value_) external pure returns (uint256) {
        return LibMemorySize.size(value_);
    }

    function size(uint256[] memory values_) external pure returns (uint256) {
        return LibMemorySize.size(values_);
    }

    function size(bytes memory bytes_) external pure returns (uint256) {
        return LibMemorySize.size(bytes_);
    }
}
