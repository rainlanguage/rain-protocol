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

    function asEvalFunctionPointer(uint256 i_) external {
        LibDebug.dumpMemory();
        LibCast.asEvalFunctionPointer(i_);
        LibDebug.dumpMemory();
    }

    function identity(uint256 a_) internal pure returns (uint256) {
        return a_;
    }

    function asUint256Uint256() external returns (uint256 i_) {
        LibDebug.dumpMemory();
        i_ = LibCast.asUint256(identity);
        LibDebug.dumpMemory();
    }

    function asUint256IntPtr(uint256[] memory is_)
        external
        returns (uint256 i_)
    {
        LibDebug.dumpMemory();
        i_ = LibCast.asUint256(LibCast.asIntegrityPointers(is_)[0]);
        LibDebug.dumpMemory();
    }

    function asUint256ArrayOpPtrs(uint256[] memory is_)
        external
        returns (uint256[] memory)
    {
        LibDebug.dumpMemory();
        is_ = LibCast.asUint256Array(LibCast.asOpcodeFunctionPointers(is_));
        LibDebug.dumpMemory();
        return is_;
    }

    function asUint256ArrayIntPtrs(uint256[] memory is_)
        external
        returns (uint256[] memory)
    {
        LibDebug.dumpMemory();
        is_ = LibCast.asUint256Array(LibCast.asIntegrityPointers(is_));
        LibDebug.dumpMemory();
        return is_;
    }

    function asUint256Bool(bool bool_) external returns (uint256 i_) {
        LibDebug.dumpMemory();
        i_ = LibCast.asUint256(bool_);
        LibDebug.dumpMemory();
    }

    function asUint256EvalPtr(uint256 i_) external returns (uint256) {
        LibDebug.dumpMemory();
        i_ = LibCast.asUint256(LibCast.asEvalFunctionPointer(i_));
        LibDebug.dumpMemory();
        return i_;
    }

    function asUint256ArrayUint256(uint256[] memory is_)
        external
        pure
        returns (uint256[] memory)
    {
        for (uint256 i_ = 0; i_ < is_.length; i_++) {
            is_[i_] = LibCast.asUint256(identity);
        }
        return is_;
    }

    function asAddresses(uint256[] memory is_)
        external
        pure
        returns (address[] memory addresses_)
    {
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
