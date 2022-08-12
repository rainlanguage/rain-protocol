// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "hardhat/console.sol";

/// @title LibDebug
/// @notice Development tools not intended for production usage.
library LibDebug {
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
}
