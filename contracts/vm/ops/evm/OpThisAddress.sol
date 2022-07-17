// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";

/// @title OpThisAddress
/// @notice Opcode for getting the address of the current contract.
library OpThisAddress {
    using LibStackTop for StackTop;

    function thisAddress(uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return stackTop_.push(uint(uint160(address(this))));
    }
}
