// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./RainInterpreter.sol";
import "../../array/LibUint256Array.sol";
import "../../bytes/LibBytes.sol";

import "hardhat/console.sol";

/// Custom type to point to memory ostensibly in a stack.
type StackTop is uint256;

/// @title LibStackTop
/// @notice A `StackTop` is just a pointer to some memory. Ostensibly it is the
/// top of some stack used by the `RainInterpreter` so that means it can move "up" and
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
/// Most of the functions in this library are equivalent to each other via
/// composition, i.e. everything could be achieved with just `up`, `down`,
/// `pop`, `push`, `peek`. The reason there is so much duplication of logic is
/// that the Solidity compiler seems to fail at inlining equivalent logic quite
/// a lot sadly. There appears to be effort upstream towards improving the
/// function inlining by the optimizer so we should expect a lot of this library
/// to become redundant or even counterproductive in the future.
library LibStackTop {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibStackTop for bytes;
    using LibUint256Array for uint256[];
    using LibBytes for uint256;

    /// Reads the value above the stack top. If the stack top is the current
    /// true stack top this is an out of bounds read. This is only useful if
    /// the stack was first moved down and the value it moved past needs to be
    /// read as part of the current operation.
    /// @param stackTop_ Position to read past/above.
    function peekUp(StackTop stackTop_) internal pure returns (uint256 a_) {
        assembly ("memory-safe") {
            a_ := mload(stackTop_)
        }
    }

    /// Read the value immediately below the given stack top. Equivalent to
    /// calling `pop` and discarding the `stackTopAfter_` value, so may be
    /// less gas than setting and discarding a value.
    /// @param stackTop_ The stack top to read below.
    /// @return a_ The value that was read.
    function peek(StackTop stackTop_) internal pure returns (uint256 a_) {
        assembly ("memory-safe") {
            a_ := mload(sub(stackTop_, 0x20))
        }
    }

    /// Reads 2 values below the given stack top.
    /// The following statements are equivalent but A may use gas if the
    /// compiler fails to inline some function calls.
    /// A:
    /// ```
    /// (uint a_, uint b_) = stackTop_.peek2();
    /// ```
    /// B:
    /// ```
    /// uint b_;
    /// (stackTop_, b_) = stackTop_.pop();
    /// uint a_ = stackTop_.peek();
    /// ```
    /// @param stackTop_ The stack top to peek below.
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

    /// Read the value immediately below the given stack top and return the
    /// stack top that points to the value that was read alongside the value.
    /// The following are equivalent but A may be cheaper if the compiler
    /// fails to inline some function calls:
    /// A:
    /// ```
    /// uint a_;
    /// (stackTop_, a_) = stackTop_.pop();
    /// ```
    /// B:
    /// ```
    /// stackTop_ = stackTop_.down();
    /// uint a_ = stackTop_.peekUp();
    /// ```
    /// @param stackTop_ The stack top to read below.
    /// @return stackTopAfter_ The stack top that points to the value that was
    /// read.
    /// @return a_ The value that was read.
    function pop(StackTop stackTop_)
        internal
        pure
        returns (StackTop stackTopAfter_, uint256 a_)
    {
        assembly ("memory-safe") {
            stackTopAfter_ := sub(stackTop_, 0x20)
            a_ := mload(stackTopAfter_)
        }
    }

    function consumeSentinel(
        StackTop stackTop_,
        StackTop stackBottom_,
        uint256 sentinel_,
        uint256 stepSize_
    ) internal pure returns (StackTop, uint256[] memory) {
        uint256[] memory array_;
        assembly ("memory-safe") {
            // Underflow is not allowed and pointing at position 0 in memory is
            // corrupt behaviour anyway.
            if iszero(stackBottom_) {
                revert(0, 0)
            }
            let sentinelLocation_ := 0
            let length_ := 0
            let step_ := mul(stepSize_, 0x20)
            for {
                stackTop_ := sub(stackTop_, 0x20)
                let end_ := sub(stackBottom_, 0x20)
            } gt(stackTop_, end_) {
                stackTop_ := sub(stackTop_, step_)
                length_ := add(length_, stepSize_)
            } {
                if eq(sentinel_, mload(stackTop_)) {
                    sentinelLocation_ := stackTop_
                    break
                }
            }
            // Sentinel MUST exist in the stack if consumer expects it to there.
            if iszero(sentinelLocation_) {
                revert(0, 0)
            }
            mstore(sentinelLocation_, length_)
            array_ := sentinelLocation_
        }
        return (stackTop_, array_);
    }

    function consumeStructs(
        StackTop stackTop_,
        StackTop stackBottom_,
        uint256 sentinel_,
        uint256 structSize_
    ) internal pure returns (StackTop, uint256[] memory) {
        uint256[] memory tempArray_;
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            sentinel_,
            structSize_
        );
        uint256 structsLength_ = tempArray_.length / structSize_;
        uint256[] memory refs_ = new uint256[](structsLength_);
        assembly ("memory-safe") {
            for {
                let refCursor_ := add(refs_, 0x20)
                let refEnd_ := add(refCursor_, mul(structsLength_, 0x20))
                let tempCursor_ := add(tempArray_, 0x20)
                let tempStepSize_ := mul(structSize_, 0x20)
            } lt(refCursor_, refEnd_) {
                refCursor_ := add(refCursor_, 0x20)
                tempCursor_ := add(tempCursor_, tempStepSize_)
            } {
                mstore(refCursor_, tempCursor_)
            }
        }
        return (stackTop_, refs_);
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
    /// functionality but A may be less gas if the compiler fails to inline
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
    /// @param stackTop_ The stack top to write at.
    /// @param a_ The value to write.
    /// @return The stack top above where `a_` was written to.
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

    /// Store a `uint256[]` at the stack top position and return the stack top
    /// above the written values. The length of the array is NOT written to the
    /// stack, ONLY the array values are copied to the stack. The following
    /// statements are equivalent in functionality but A may be less gas if the
    /// compiler fails to inline some function calls.
    /// A:
    /// ```
    /// stackTop_ = stackTop_.push(array_);
    /// ```
    /// B:
    /// ```
    /// unchecked {
    ///   for (uint i_ = 0; i_ < array_.length; i_++) {
    ///     stackTop_ = stackTop_.push(array_[i_]);
    ///   }
    /// }
    /// ```
    /// @param stackTop_ The stack top to write at.
    /// @param array_ The array of values to write.
    /// @return The stack top above the array.
    function push(StackTop stackTop_, uint256[] memory array_)
        internal
        pure
        returns (StackTop)
    {
        array_.unsafeCopyValuesTo(StackTop.unwrap(stackTop_));
        return stackTop_.up(array_.length);
    }

    /// Store a `uint256[]` at the stack top position and return the stack top
    /// above the written values. The length of the array IS written to the
    /// stack.
    /// @param stackTop_ The stack top to write at.
    /// @param array_ The array of values and length to write.
    /// @return The stack top above the array.
    function pushWithLength(StackTop stackTop_, uint256[] memory array_)
        internal
        pure
        returns (StackTop)
    {
        return stackTop_.push(array_.length).push(array_);
    }

    /// Store `bytes` at the stack top position and return the stack top above
    /// the written bytes. The length of the bytes is NOT written to the stack,
    /// ONLY the bytes are written. As `bytes` may be of arbitrary length, i.e.
    /// it MAY NOT be a multiple of 32, the push is unaligned. The caller MUST
    /// ensure that this is safe in context of subsequent reads and writes.
    /// @param stackTop_ The stack top to write at.
    /// @param bytes_ The bytes to write at the stack top.
    /// @return The stack top above the written bytes.
    function unalignedPush(StackTop stackTop_, bytes memory bytes_)
        internal
        pure
        returns (StackTop)
    {
        StackTop.unwrap(bytes_.asStackTop().up()).unsafeCopyBytesTo(
            StackTop.unwrap(stackTop_),
            bytes_.length
        );
        return stackTop_.upBytes(bytes_.length);
    }

    /// Store `bytes` at the stack top position and return the stack top above
    /// the written bytes. The length of the bytes IS written to the stack in
    /// addition to the bytes. As `bytes` may be of arbitrary length, i.e. it
    /// MAY NOT be a multiple of 32, the push is unaligned. The caller MUST
    /// ensure that this is safe in context of subsequent reads and writes.
    /// @param stackTop_ The stack top to write at.
    /// @param bytes_ The bytes to write with their length at the stack top.
    /// @return The stack top above the written bytes.
    function unalignedPushWithLength(StackTop stackTop_, bytes memory bytes_)
        internal
        pure
        returns (StackTop)
    {
        return stackTop_.push(bytes_.length).unalignedPush(bytes_);
    }

    /// Store 8x `uint256` at the stack top position and return the stack top
    /// above the written value. The following statements are equivalent in
    /// functionality but A may be cheaper if the compiler fails to
    /// inline some function calls.
    /// A:
    /// ```
    /// stackTop_ = stackTop_.push(a_, b_, c_, d_, e_, f_, g_, h_);
    /// ```
    /// B:
    /// ```
    /// stackTop_ = stackTop_
    ///   .push(a_)
    ///   .push(b_)
    ///   .push(c_)
    ///   .push(d_)
    ///   .push(e_)
    ///   .push(f_)
    ///   .push(g_)
    ///   .push(h_);
    /// @param stackTop_ The stack top to write at.
    /// @param a_ The first value to write.
    /// @param b_ The second value to write.
    /// @param c_ The third value to write.
    /// @param d_ The fourth value to write.
    /// @param e_ The fifth value to write.
    /// @param f_ The sixth value to write.
    /// @param g_ The seventh value to write.
    /// @param h_ The eighth value to write.
    /// @return The stack top above where `h_` was written.
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

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256) internal view returns (uint256) fn_
    ) internal view returns (StackTop) {
        uint256 a_;
        uint256 location_;
        assembly ("memory-safe") {
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
        }
        a_ = fn_(a_);
        assembly ("memory-safe") {
            mstore(location_, a_)
        }
        return stackTop_;
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(Operand, uint256) internal view returns (uint256) fn_,
        Operand operand_
    ) internal view returns (StackTop) {
        uint256 a_;
        uint256 location_;
        assembly ("memory-safe") {
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
        }
        a_ = fn_(operand_, a_);
        assembly ("memory-safe") {
            mstore(location_, a_)
        }
        return stackTop_;
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256, uint256) internal view returns (uint256) fn_
    ) internal view returns (StackTop) {
        uint256 a_;
        uint256 b_;
        uint256 location_;
        assembly ("memory-safe") {
            stackTop_ := sub(stackTop_, 0x20)
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTop_)
        }
        a_ = fn_(a_, b_);
        assembly ("memory-safe") {
            mstore(location_, a_)
        }
        return stackTop_;
    }

    /// Reduce a function N times, reading and writing inputs and the accumulated
    /// result on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @param n_ The number of times to apply fn_ to accumulate a final result.
    /// @return stackTopAfter_ The new stack top above the outputs of fn_.
    function applyFnN(
        StackTop stackTop_,
        function(uint256, uint256) internal view returns (uint256) fn_,
        uint256 n_
    ) internal view returns (StackTop stackTopAfter_) {
        unchecked {
            uint256 bottom_;
            uint256 cursor_;
            uint256 a_;
            uint256 b_;
            assembly ("memory-safe") {
                bottom_ := sub(stackTop_, mul(n_, 0x20))
                a_ := mload(bottom_)
                stackTopAfter_ := add(bottom_, 0x20)
                cursor_ := stackTopAfter_
            }
            while (cursor_ < StackTop.unwrap(stackTop_)) {
                assembly ("memory-safe") {
                    b_ := mload(cursor_)
                }
                a_ = fn_(a_, b_);
                cursor_ += 0x20;
            }
            assembly ("memory-safe") {
                mstore(bottom_, a_)
            }
        }
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256, uint256, uint256) internal view returns (uint256) fn_
    ) internal view returns (StackTop) {
        uint256 a_;
        uint256 b_;
        uint256 c_;
        uint256 location_;
        assembly ("memory-safe") {
            stackTop_ := sub(stackTop_, 0x40)
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTop_)
            c_ := mload(add(stackTop_, 0x20))
        }
        a_ = fn_(a_, b_, c_);
        assembly ("memory-safe") {
            mstore(location_, a_)
        }
        return stackTop_;
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @param operand_ Operand is passed from the source instead of the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(Operand, uint256, uint256) internal view returns (uint256) fn_,
        Operand operand_
    ) internal view returns (StackTop) {
        uint256 a_;
        uint256 b_;
        uint256 location_;
        assembly ("memory-safe") {
            stackTop_ := sub(stackTop_, 0x20)
            location_ := sub(stackTop_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTop_)
        }
        a_ = fn_(operand_, a_, b_);
        assembly ("memory-safe") {
            mstore(location_, a_)
        }
        return stackTop_;
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @param length_ The length of the array to pass to fn_ from the stack.
    /// @return stackTopAfter_ The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256) fn_,
        uint256 length_
    ) internal view returns (StackTop stackTopAfter_) {
        (uint256 b_, uint256[] memory tail_) = stackTop_.list(length_);
        stackTopAfter_ = tail_.asStackTop();
        (StackTop location_, uint256 a_) = stackTopAfter_.pop();
        location_.set(fn_(a_, b_, tail_));
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @param length_ The length of the array to pass to fn_ from the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256, uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256) fn_,
        uint256 length_
    ) internal view returns (StackTop) {
        (uint256 c_, uint256[] memory tail_) = stackTop_.list(length_);
        (StackTop stackTopAfter_, uint256 b_) = tail_.asStackTop().pop();
        uint256 a_ = stackTopAfter_.peek();
        stackTopAfter_.down().set(fn_(a_, b_, c_, tail_));
        return stackTopAfter_;
    }

    /// Execute a function, reading and writing inputs and outputs on the stack.
    /// The caller MUST ensure this does not result in unsafe reads and writes.
    /// @param stackTop_ The stack top to read and write to.
    /// @param fn_ The function to run on the stack.
    /// @param length_ The length of the arrays to pass to fn_ from the stack.
    /// @return The new stack top above the outputs of fn_.
    function applyFn(
        StackTop stackTop_,
        function(uint256, uint256[] memory, uint256[] memory)
            internal
            view
            returns (uint256[] memory) fn_,
        uint256 length_
    ) internal view returns (StackTop) {
        StackTop csStart_ = stackTop_.down(length_);
        uint256[] memory cs_ = LibUint256Array.copyToNewUint256Array(
            StackTop.unwrap(csStart_),
            length_
        );
        (uint256 a_, uint256[] memory bs_) = csStart_.list(length_);

        uint256[] memory results_ = fn_(a_, bs_, cs_);
        require(results_.length == length_, "BAD_RESULT_LENGTH");
        StackTop bottom_ = bs_.asStackTop();
        LibUint256Array.unsafeCopyValuesTo(results_, StackTop.unwrap(bottom_));
        return bottom_.up(length_);
    }

    /// Returns `length_` values from the stack as an array without allocating
    /// new memory. As arrays always start with their length, this requires
    /// writing the length value to the stack below the array values. The value
    /// that is overwritten in the process is also returned so that data is not
    /// lost. For example, imagine a stack `[ A B C D ]` and we list 2 values.
    /// This will write the stack to look like `[ A 2 C D ]` and return both `B`
    /// and a pointer to `2` represented as a `uint256[]`.
    /// The returned array is ONLY valid for as long as the stack DOES NOT move
    /// back into its memory. As soon as the stack moves up again and writes into
    /// the array it will be corrupt. The caller MUST ensure that it does not
    /// read from the returned array after it has been corrupted by subsequent
    /// stack writes.
    /// @param stackTop_ The stack top to read the values below into an array.
    /// @param length_ The number of values to include in the returned array.
    /// @return head_ The value that was overwritten with the length.
    /// @return tail_ The array constructed from the stack memory.
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

    /// Cast a `uint256[]` array to a stack top. The stack top will point to the
    /// length of the array, NOT its first value.
    /// @param array_ The array to cast to a stack top.
    /// @return stackTop_ The stack top that points to the length of the array.
    function asStackTop(uint256[] memory array_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := array_
        }
    }

    /// Cast a stack top to an array. The value immediately above the stack top
    /// will be treated as the length of the array, so the proceeding length
    /// values will be the items of the array. The caller MUST ensure the values
    /// above the stack top constitute a valid array. The retured array will be
    /// corrupt if/when the stack subsequently moves into it and writes to those
    /// memory locations. The caller MUST ensure that it does NOT read from the
    /// returned array after the stack writes over it.
    /// @param stackTop_ The stack top that will be cast to an array.
    /// @return array_ The array above the stack top.
    function asUint256Array(StackTop stackTop_)
        internal
        pure
        returns (uint256[] memory array_)
    {
        assembly ("memory-safe") {
            array_ := stackTop_
        }
    }

    /// Cast a stack top to bytes. The value immediately above the stack top will
    /// be treated as the length of the `bytes`, so the proceeding length bytes
    /// will be the data of the `bytes`. The caller MUST ensure the length and
    /// bytes above the stack top constitute valid `bytes` data. The returned
    /// `bytes` will be corrupt if/when the stack subsequently moves into it and
    /// writes to those memory locations. The caller MUST ensure that it does
    /// NOT read from the returned bytes after the stack writes over it.
    /// @param stackTop_ The stack top that will be cast to bytes.
    /// @return bytes_ The bytes above the stack top.
    function asBytes(StackTop stackTop_)
        internal
        pure
        returns (bytes memory bytes_)
    {
        assembly ("memory-safe") {
            bytes_ := stackTop_
        }
    }

    /// Cast a `uint256[]` array to a stack top after its length. The stack top
    /// will point to the first item of the array, NOT its length.
    /// @param array_ The array to cast to a stack top.
    /// @return stackTop_ The stack top that points to the first item of the array.
    function asStackTopUp(uint256[] memory array_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := add(array_, 0x20)
        }
    }

    /// Cast `bytes` to a stack top. The stack top will point to the length of
    /// the `bytes`, NOT the first byte.
    /// @param bytes_ The `bytes` to cast to a stack top.
    /// @return stackTop_ The stack top that points to the length of the bytes.
    function asStackTop(bytes memory bytes_)
        internal
        pure
        returns (StackTop stackTop_)
    {
        assembly ("memory-safe") {
            stackTop_ := bytes_
        }
    }

    /// Returns the stack top 32 bytes above/past the passed stack top.
    /// @param stackTop_ The stack top at the starting position.
    /// @return The stack top 32 bytes above the passed stack top.
    function up(StackTop stackTop_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20);
        }
    }

    /// Returns the stack top `n_ * 32` bytes above/past the passed stack top.
    /// @param stackTop_ The stack top at the starting position.
    /// @param n_ The multiplier on the stack movement.
    /// @return The stack top `n_ * 32` bytes above/past the passed stack top.
    function up(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20 * n_);
        }
    }

    /// Returns the stack top `n_` bytes above/past the passed stack top.
    /// The returned stack top MAY NOT be aligned with the passed stack top for
    /// subsequent 32 byte reads and writes. The caller MUST ensure that it is
    /// safe to read and write data relative to the returned stack top.
    /// @param stackTop_ The stack top at the starting position.
    /// @param n_ The number of bytes to move.
    /// @return The stack top `n_` bytes above/past the passed stack top.
    function upBytes(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) + n_);
        }
    }

    /// Returns the stack top 32 bytes below/before the passed stack top.
    /// @param stackTop_ The stack top at the starting position.
    /// @return The stack top 32 bytes below/before the passed stack top.
    function down(StackTop stackTop_) internal pure returns (StackTop) {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) - 0x20);
        }
    }

    /// Returns the stack top `n_ * 32` bytes below/before the passed stack top.
    /// @param stackTop_ The stack top at the starting position.
    /// @param n_ The multiplier on the movement.
    /// @return The stack top `n_ * 32` bytes below/before the passed stack top.
    function down(StackTop stackTop_, uint256 n_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            return StackTop.wrap(StackTop.unwrap(stackTop_) - 0x20 * n_);
        }
    }

    /// Convert two stack top values to a single stack index. A stack index is
    /// the distance in 32 byte increments between two stack positions. The
    /// calculations assumes the two stack positions are aligned. The caller MUST
    /// ensure the alignment of both values. The calculation is unchecked and MAY
    /// underflow. The caller MUST ensure that the stack top is always above the
    /// stack bottom.
    /// @param stackBottom_ The lower of the two values.
    /// @param stackTop_ The higher of the two values.
    /// @return The stack index as 32 byte distance between the two stack
    /// positions.
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
