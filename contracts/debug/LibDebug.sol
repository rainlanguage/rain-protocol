// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "hardhat/console.sol";

/// @title LibDebug
/// @notice Development tools not intended for production usage.
library LibDebug {
    event DebugEvent(uint256 value);
    event DebugEvent(uint256[] values);
    event DebugEvent(bytes value);

    /// Outputs the entire allocated memory in the opinion of Solidity to an
    /// event. Avoids allocating new memory in the process of emitting the event.
    /// If memory has been written past the Solidity free memory pointer at 0x40
    /// then it will NOT be included in the dump.
    function dumpMemory() internal {
        assembly ("memory-safe") {
            log0(0, mload(0x40))
        }
    }

    /// Logs the current position of the Solidity free memory pointer at 0x40.
    function logFreeMemoryPointer() internal view {
        uint256 ptr_;
        assembly ("memory-safe") {
            ptr_ := mload(0x40)
        }
        console.log("memory pointer: %s", ptr_);
    }

    function emitEvent(uint256 value_) internal {
        emit DebugEvent(value_);
    }

    function emitEvent(uint256[] memory values_) internal {
        emit DebugEvent(values_);
    }

    function emitEvent(bytes memory value_) internal {
        emit DebugEvent(value_);
    }
}
