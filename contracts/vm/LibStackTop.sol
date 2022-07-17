// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type StackTop is uint;

library LibStackTop {
    function push(StackTop stackTop_, uint value_) internal pure returns (StackTop) {
        assembly ("memory-safe") {
            mstore(stackTop_, value_)
            stackTop_ := add(stackTop_, 0x20)
        }
        return stackTop_;
    }
}