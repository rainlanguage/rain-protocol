// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../type/LibCast.sol";
import "../MemoryDump.sol";

/// @title LibCastTest
/// Thin wrapper around `LibCast` library exposing functions for testing
contract LibCastTest {
    using LibCast for function(uint256) pure returns (uint256);
    using LibCast for function(uint256) view returns (uint256);
    using LibCast for function(uint256, StackTop) view returns (StackTop);
    using LibCast for function(uint256, StackTop) view returns (StackTop)[];
    using LibCast for uint256[];
    using LibCast for bool;

    function asOpFn(uint256 i_) external {
        MemoryDump.dumpMemory();
        LibCast.asOpFn(i_);
        MemoryDump.dumpMemory();
    }

    function asStackMoveFn(uint256 i_) external {
        MemoryDump.dumpMemory();
        LibCast.asStackMoveFn(i_);
        MemoryDump.dumpMemory();
    }

    function stackMoveFnAsUint256(uint256 i_) external returns (uint256) {
        MemoryDump.dumpMemory();
        i_ = LibCast.asStackMoveFn(i_).asUint256();
        MemoryDump.dumpMemory();
        return i_;
    }

    function boolAsUint256(bool bool_) external returns (uint256 i_) {
        MemoryDump.dumpMemory();
        i_ = bool_.asUint256();
        MemoryDump.dumpMemory();
    }

    function opFnAsUint256(uint256 i_) external returns (uint256) {
        MemoryDump.dumpMemory();
        i_ = LibCast.asOpFn(i_).asUint256();
        MemoryDump.dumpMemory();
        return i_;
    }

    function opFnsAsUint256Array(uint256[] memory is_)
        external
        returns (uint256[] memory)
    {
        function(uint256, StackTop) view returns (StackTop)[]
            memory fns_ = new function(uint256, StackTop)
                view
                returns (StackTop)[](is_.length);

        for (uint i_ = 0; i_ < is_.length; i_++) {
            fns_[i_] = LibCast.asOpFn(is_[i_]);
        }

        MemoryDump.dumpMemory();
        is_ = fns_.asUint256Array();
        MemoryDump.dumpMemory();
        return is_;
    }

    function asAddresses(uint256[] memory is_)
        external
        returns (address[] memory addresses_)
    {
        MemoryDump.dumpMemory();
        addresses_ = is_.asAddresses();
        MemoryDump.dumpMemory();
    }
}
