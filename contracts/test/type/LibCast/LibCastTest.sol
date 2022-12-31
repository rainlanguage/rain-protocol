// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../type/LibCast.sol";
import "../../../debug/LibDebug.sol";

/// @title LibCastTest
/// Thin wrapper around `LibCast` library exposing functions for testing
contract LibCastTest {
    function asOpFunctionPointer(uint256 i_) external {
        LibDebug.dumpMemory();
        LibCast.asOpFunctionPointer(i_);
        LibDebug.dumpMemory();
    }

    function asIntegrityFunctionPointer(uint256 i_) external {
        LibDebug.dumpMemory();
        LibCast.asIntegrityFunctionPointer(i_);
        LibDebug.dumpMemory();
    }

    function identity(uint256 a_) internal pure returns (uint256) {
        return a_;
    }

    function asUint256ArrayOpPtrs(
        uint256[] memory is_
    ) external returns (uint256[] memory) {
        LibDebug.dumpMemory();
        is_ = LibCast.asUint256Array(LibCast.asOpcodeFunctionPointers(is_));
        LibDebug.dumpMemory();
        return is_;
    }

    function asUint256ArrayIntPtrs(
        uint256[] memory is_
    ) external returns (uint256[] memory) {
        LibDebug.dumpMemory();
        is_ = LibCast.asUint256Array(LibCast.asIntegrityPointers(is_));
        LibDebug.dumpMemory();
        return is_;
    }

    function asAddresses(
        uint256[] memory is_
    ) external pure returns (address[] memory addresses_) {
        addresses_ = LibCast.asAddresses(is_);
    }

    function asOpFunctionPointers(uint256[] memory is_) external {
        LibDebug.dumpMemory();
        LibCast.asOpcodeFunctionPointers(is_);
        LibDebug.dumpMemory();
    }

    function asIntegrityPointers(uint256[] memory is_) external {
        LibDebug.dumpMemory();
        LibCast.asIntegrityPointers(is_);
        LibDebug.dumpMemory();
    }
}
