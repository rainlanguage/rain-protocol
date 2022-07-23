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

    function push(
        StackTop stackTop_,
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256 d_,
        uint256 e_,
        uint256 f_,
        uint256 g_,
        uint256 h_
    ) internal pure returns (StackTop) {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
            mstore(add(stackTop_, 0x20), b_)
            mstore(add(stackTop_, 0x40), c_)
            mstore(add(stackTop_, 0x60), d_)
            mstore(add(stackTop_, 0x80), e_)
            mstore(add(stackTop_, 0xA0), f_)
            mstore(add(stackTop_, 0xC0), g_)
            mstore(add(stackTop_, 0xE0), h_)
            stackTop_ := add(stackTop_, 0x100)
        }
        return stackTop_;
    }

    function peekUp(StackTop stackTop_) internal pure returns (uint256 a_) {
        assembly ("memory-safe") {
            a_ := mload(stackTop_)
        }
    }

    function peekUp(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (uint256 a_)
    {
        assembly ("memory-safe") {
            a_ := mload(add(stackTop_, mul(0x20, n_)))
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

    function list(StackTop stackTop_, uint256 length_)
        internal
        pure
        returns (uint256 head_, uint256[] memory tail_)
    {
        assembly ("memory-safe") {
            tail_ := sub(stackTop_, add(0x20, mul(length_, 0x20)))
            head_ := mload(tail_)
            mstore(tail_, length_)
        }
    }

    function asStackTop(uint256[] memory list_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := list_
        }
    }

    function asStackTopUp(uint256[] memory list_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := add(list_, 0x20)
        }
    }

    function asStackTop(bytes memory bytes_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := bytes_
        }
    }

    // function asStackTopUp(bytes memory bytes_) internal pure returns (StackTop stackTop_) {
    //     assembly ("memory-safe") {
    //         stackTop_ := add(bytes_, 0x20)
    //     }
    // }

    function up(StackTop stackTop_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20);
        }
    }

    function up(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20 * n_);
        }
    }

    function down(StackTop stackTop_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) - 0x20);
        }
    }

    function down(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) - 0x20 * n_);
        }
    }

    function lt(StackTop a_, StackTop b_) internal pure returns (bool) {
        return StackTop.unwrap(a_) < StackTop.unwrap(b_);
    }
}
