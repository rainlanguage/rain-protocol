// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title OpThisAddress
/// @notice Opcode for getting the address of the current contract.
library OpThisAddress {
    function thisAddress(uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        assembly ("memory-safe") {
            mstore(stackTopLocation_, address())
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }
}
