// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibVMState.sol";
import "../../debug/LibDebug.sol";
import "../../vm/runtime/LibStackTop.sol";

/// @title LibVMStateTest
/// Test wrapper around `LibVMState` library.
contract LibVMStateTest {
    using LibVMState for VMState;
    using LibStackTop for uint256[];

    function debug(
        StackTop stackTop_,
        DebugStyle debugStyle_,
        bytes[] memory sources_
    ) external returns (StackTop stackTopAfter_) {
        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            sources_ // ptrSources
        );

        LibDebug.dumpMemory();
        stackTopAfter_ = state_.debug(stackTop_, debugStyle_);
        LibDebug.dumpMemory();
    }

    function toBytesPacked(bytes[] memory sources_)
        external
        returns (bytes memory bytesPacked_)
    {
        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            sources_ // ptrSources
        );

        LibDebug.dumpMemory();
        bytesPacked_ = state_.toBytesPacked();
        LibDebug.dumpMemory();
    }
}
