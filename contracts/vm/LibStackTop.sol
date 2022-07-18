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

    function peekUp(StackTop stackTop_) internal pure returns (uint a_) {
        assembly ("memory-safe") {
            a_ := mload(stackTop_)
        }
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

    function list(StackTop stackTop_, uint length_) internal pure returns (uint head_, uint[] memory tail_) {
        assembly ("memory-safe") {
            tail_ := sub(stackTop_, add(0x20, mul(length_, 0x20)))
            head_ := mload(tail_)
            mstore(tail_, length_)
        }
    }

    function asStackTop(uint[] memory list_) internal pure returns (StackTop stackTop_) {
        assembly ("memory-safe") {
            stackTop_ := list_
        }
    }

    function up(StackTop stackTop_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20);
        }
    }

    function down(StackTop stackTop_, uint n_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) - 0x20 * n_);
        }
    }

    function lt(StackTop a_, StackTop b_) internal pure returns (bool) {
        return StackTop.unwrap(a_) < StackTop.unwrap(b_);
    }
}
