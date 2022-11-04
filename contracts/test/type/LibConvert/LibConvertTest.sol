// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../type/LibConvert.sol";
import "../../../debug/LibDebug.sol";

/// @title LibConvertTest
/// Thin wrapper around `LibConvert` library exposing functions for testing
contract LibConvertTest {
    function toBytes(
        uint256[] memory is_
    ) external returns (bytes memory bytes_) {
        LibDebug.dumpMemory();
        bytes_ = LibConvert.toBytes(is_);
        LibDebug.dumpMemory();
    }

    function unsafeTo16BitBytes(
        uint256[] memory is_
    ) external returns (bytes memory bytes_) {
        LibDebug.dumpMemory();
        bytes_ = LibConvert.unsafeTo16BitBytes(is_);
        LibDebug.dumpMemory();
    }
}
