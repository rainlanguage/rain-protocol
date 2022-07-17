// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";

/// @title OpExp
/// @notice Opcode to exponentiate N numbers.
library OpExp {
    function exp(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        uint256 location_;
        uint256 accumulator_;
        uint256 cursor_;
        uint256 item_;
        assembly {
            location_ := sub(stackTop_, mul(operand_, 0x20))
            accumulator_ := mload(location_)
            cursor_ := add(location_, 0x20)
        }
        while (cursor_ < StackTop.unwrap(stackTop_)) {
            assembly ("memory-safe") {
                item_ := mload(cursor_)
                cursor_ := add(cursor_, 0x20)
            }
            // This is NOT in assembly so that we get overflow safety.
            accumulator_ = accumulator_**item_;
        }
        assembly ("memory-safe") {
            mstore(location_, accumulator_)
            stackTop_ := add(location_, 0x20)
        }
        return stackTop_;
    }
}
