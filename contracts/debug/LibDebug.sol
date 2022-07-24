// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "hardhat/console.sol";

library LibDebug {
    function dumpMemory() internal {
        assembly ("memory-safe") {
            log0(0, mload(0x40))
        }
    }

    function logFreeMemoryPointer() internal view {
        uint256 ptr_;
        assembly ("memory-safe") {
            ptr_ := mload(0x40)
        }
        console.log("memory pointer: %s", ptr_);
    }
}
