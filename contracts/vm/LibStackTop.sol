// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// Custom type to point to memory ostensibly in a stack.
type StackTop is uint256;

/// @title LibStackTop
/// @notice A `StackTop` is just a pointer to some memory. Ostensibly it is the
/// top of some stack used by the `RainVM` so that means it can move "up" and
/// "down" (increment and decrement) by `uint256` (32 bytes) increments. In
/// general we're abusing that concept a bit to extend to things like the bottom
/// of a stack or a hypothetical maximum stack or even treating an arbitrary
/// `uint256[]` array as "a stack". In the future it's likely this lib and
/// concept will be renamed to reflect that it is used much more generally than
/// simply the top of some stack.
/// All the functions in `LibStackTop` operate on memory to read/write what is
/// referenced but the pointers and values themselves are typically input/output
/// of the functions. I.e. the stack top itself is not being mutated in-place,
/// typically the caller would have both the input stack top and the output
/// stack top in scope after calling library functions.
library LibStackTop {
    /// Read the value immediately below the given stack top.
    /// @param stackTop_ The stack top to read below.
    /// @return a_ The value that was read.
    function peek(StackTop stackTop_) internal pure returns (uint256 a_) {
        assembly ("memory-safe") {
            a_ := mload(sub(stackTop_, 0x20))
        }
    }

    /// Read the value immediately below the given stack top and return the
    /// stack top that points to the value that was read alongside the value.
    /// @param stackTop_ The stack top to read below.
    /// @return location_ The stack top that points to the value that was read.
    /// @return a_ The value that was read.
    function pop(StackTop stackTop_)
        internal
        pure
        returns (StackTop location_, uint256 a_)
    {
        assembly ("memory-safe") {
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
        }
    }

    /// Write a value at the stack top location. Typically not useful if the
    /// given stack top is not subsequently moved past the written value , or
    /// if the given stack top is actually located somewhere below the "true"
    /// stack top.
    /// @param stackTop_ The stack top to write the value at.
    /// @param a_ The value to write.
    function set(StackTop stackTop_, uint256 a_) internal pure {
        assembly ("memory-safe") {
            mstore(stackTop_, a_)
        }
    }

    /// Store a `uint256` at the stack top position and return the stack top
    /// above the written value. The following statements are equivalent in
    /// functionality but `push` may be less gas if the compiler fails to inline
    /// some function calls.
    /// A:
    /// ```
    /// stackTop_ = stackTop_.push(a_);
    /// ```
    /// B:
    /// ```
    /// stackTop_.set(a_);
    /// stackTop_ = stackTop_.up();
    /// ```
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



    function peek2(StackTop stackTop_)
        internal
        pure
        returns (uint256 a_, uint256 b_)
    {
        assembly ("memory-safe") {
            a_ := mload(sub(stackTop_, 0x40))
            b_ := mload(sub(stackTop_, 0x20))
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

    function asStackTop(uint256[] memory array_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := array_
        }
    }

    function asUint256Array(StackTop stackTop_)
        internal
        pure
        returns (uint256[] memory array_)
    {
        assembly ("memory-safe") {
            array_ := stackTop_
        }
    }

    function asStackTopUp(uint256[] memory array_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := add(array_, 0x20)
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

    function toIndex(StackTop stackBottom_, StackTop stackTop_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            return
                (StackTop.unwrap(stackTop_) - StackTop.unwrap(stackBottom_)) /
                0x20;
        }
    }
}
