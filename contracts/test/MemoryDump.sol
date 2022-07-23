// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

library MemoryDump {
    function dumpMemory() internal {
        assembly ("memory-safe") {
            log0(0, mload(0x40))
        }
    }
}
