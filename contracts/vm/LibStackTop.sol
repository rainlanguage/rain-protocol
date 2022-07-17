// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type StackTop is uint256;

library LibStackTop {
    function push(StackTop stackTop_, uint256 a_)
        internal
        pure
        returns (StackTop)
    {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
            stackTop_ := add(stackTop_, 0x20)
        }
        return stackTop_;
    }

    function peek(StackTop stackTop_)
        internal
        pure
        returns (StackTop location_, uint256 a_)
    {
        assembly ("memory-safe") {
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
        }
    }

    function popAndPeek(StackTop stackTop_)
        internal
        pure
        returns (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 a_,
            uint256 b_
        )
    {
        assembly ("memory-safe") {
            stackTopAfter_ := sub(stackTop_, 0x20)
            location_ := sub(stackTopAfter_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTopAfter_)
        }
    }

    function pop2AndPeek(StackTop stackTop_)
        internal
        pure
        returns (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 a_,
            uint256 b_,
            uint256 c_
        )
    {
        assembly ("memory-safe") {
            stackTopAfter_ := sub(stackTop_, 0x40)
            location_ := sub(stackTopAfter_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTopAfter_)
            c_ := mload(add(stackTopAfter_, 0x20))
        }
    }

    function set(StackTop stackTop_, uint256 a_) internal pure {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
        }
    }
}
