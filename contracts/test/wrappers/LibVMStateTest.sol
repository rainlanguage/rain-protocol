// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibVMState.sol";
import "../../debug/LibDebug.sol";

/// @title LibVMStateTest
/// Test wrapper around `LibVMState` library.
contract LibVMStateTest {
    using LibVMState for VMState;

    function debug(StackTop stackTop_, DebugStyle debugStyle_)
        external
        returns (StackTop stackTopAfter_)
    {
        VMState memory state_ = VMState(
            StackTop.wrap(0), // stackBottom,
            StackTop.wrap(0), // constantsBottom,
            new uint256[](0), // context,
            new bytes[](0) // ptrSources
        );

        LibDebug.dumpMemory();
        stackTopAfter_ = state_.debug(stackTop_, debugStyle_);
        LibDebug.dumpMemory();
    }
}
