// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type StackTop is uint;

library LibStackTop {
    function push(StackTop stackTop_, uint a_) internal pure returns (StackTop) {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
            stackTop_ := add(stackTop_, 0x20)
        }
        return stackTop_;
    }

    function peek(StackTop stackTop_) internal pure returns (StackTop peek_, uint a_) {
        assembly ("memory-safe") {
            peek_ := sub(stackTop_, 0x20)
            a_ := mload(peek_)
        }
    }

    function set(StackTop stackTop_, uint a_) internal pure {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
        }
    }
}