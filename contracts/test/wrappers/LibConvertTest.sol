// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../type/LibConvert.sol";
import "../MemoryDump.sol";

/// @title LibConvertTest
/// Thin wrapper around `LibConvert` library exposing functions for testing
contract LibConvertTest {
    function toBytes(uint256[] memory is_)
        external
        returns (bytes memory bytes_)
    {
        MemoryDump.dumpMemory();
        bytes_ = LibConvert.toBytes(is_);
        MemoryDump.dumpMemory();
    }
}
