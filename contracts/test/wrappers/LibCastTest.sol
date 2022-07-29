// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../type/LibCast.sol";
import "../../debug/LibDebug.sol";

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

    function asEvalFunctionPointer(uint256 i_) external {
        LibDebug.dumpMemory();
        LibCast.asEvalFunctionPointer(i_);
        LibDebug.dumpMemory();
    }

    function identity(uint256 i_) internal view returns (uint256) {
        return i_;
    }

    function asUint256() external returns (uint256 i_) {
        LibDebug.dumpMemory();
        i_ = LibCast.asUint256(identity);
        LibDebug.dumpMemory();
    }
}
