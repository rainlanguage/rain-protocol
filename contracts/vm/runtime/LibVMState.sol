// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "../../type/LibCast.sol";
import "../../array/LibUint256Array.sol";
import "../../memory/LibMemorySize.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

enum DebugStyle {
    StatePacked,
    Stack
}

/// Everything required to evaluate and track the state of a rain script.
/// As this is a struct it will be in memory when passed to `RainVM` and so
/// will be modified by reference internally. This is important for gas
/// efficiency; the stack, arguments and stackIndex will likely be mutated by
/// the running script.
/// @param stackIndex Opcodes write to the stack at the stack index and can
/// consume from the stack by decrementing the index and reading between the
/// old and new stack index.
/// IMPORANT: The stack is never zeroed out so the index must be used to
/// find the "top" of the stack as the result of an `eval`.
/// @param stack Stack is the general purpose runtime state that opcodes can
/// read from and write to according to their functionality.
/// @param sources Sources available to be executed by `eval`.
/// Notably `ZIPMAP` can also select a source to execute by index.
/// @param constants Constants that can be copied to the stack by index by
/// `VAL`.
/// @param arguments `ZIPMAP` populates arguments which can be copied to the
/// stack by `VAL`.
struct VMState {
    StackTop stackBottom;
    StackTop constantsBottom;
    uint256[] context;
    bytes[] ptrSources;
}

SourceIndex constant DEFAULT_SOURCE_INDEX = SourceIndex.wrap(0);

library LibVMState {
    using SafeCast for uint256;
    using LibMemorySize for uint256;
    using LibMemorySize for uint256[];
    using LibMemorySize for bytes;
    using LibUint256Array for uint256[];
    using LibVMState for VMState;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibStackTop for bytes;
    using LibCast for uint256;
    using LibCast for function(VMState memory, SourceIndex, StackTop)
        view
        returns (StackTop);

    function debug(
        VMState memory state_,
        StackTop stackTop_,
        DebugStyle debugStyle_
    ) internal view returns (StackTop) {
        if (debugStyle_ == DebugStyle.StatePacked) {
            console.logBytes(state_.toBytesPacked());
        } else if (debugStyle_ == DebugStyle.Stack) {
            uint256 index_ = state_.stackBottom.toIndex(stackTop_);
            (uint head_, uint[] memory tail_) = stackTop_.list(index_);
            console.log("~~~");
            unchecked {
                for (uint256 i_ = 0; i_ < index_; i_++) {
                    console.log(i_, tail_[i_]);
                }
            }
            console.log("***");
            state_.stackBottom.down().set(head_);
        }
        return stackTop_;
    }

    function fromBytesPacked(
        bytes memory stateBytes_,
        uint256[] memory context_
    ) internal pure returns (VMState memory) {
        unchecked {
            VMState memory state_;

            // Context and the eval pointer are provided by the caller so no
            // processing is needed for these.
            state_.context = context_;

            StackTop cursor_ = stateBytes_.asStackTop().up();
            // The end of processing is the end of the state bytes.
            StackTop end_ = cursor_.upBytes(cursor_.peek());

            // Read the stack length and build a stack.
            cursor_ = cursor_.up();
            uint256 stackLength_ = cursor_.peek();
            // The stack is never stored in stack bytes so we allocate a new
            // array for it with length as per the indexes and point the state
            // at it.
            state_.stackBottom = (new uint256[](stackLength_)).asStackTopUp();

            // Reference the constants array and move cursor past it.
            cursor_ = cursor_.up();
            state_.constantsBottom = cursor_;
            cursor_ = cursor_.up(cursor_.peek());

            // Rebuild the sources array.
            uint256 i_ = 0;
            StackTop lengthCursor_ = cursor_;
            uint256 sourcesLength_ = 0;
            while (StackTop.unwrap(lengthCursor_) < StackTop.unwrap(end_)) {
                lengthCursor_ = lengthCursor_
                    .upBytes(lengthCursor_.peekUp())
                    .up();
                sourcesLength_++;
            }
            state_.ptrSources = new bytes[](sourcesLength_);
            while (StackTop.unwrap(cursor_) < StackTop.unwrap(end_)) {
                state_.ptrSources[i_] = cursor_.asBytes();
                cursor_ = cursor_.upBytes(cursor_.peekUp()).up();
                i_++;
            }
            return state_;
        }
    }

    function toBytesPacked(
        uint256 stackLength_,
        uint256[] memory constants_,
        bytes[] memory ptrSources_
    ) internal pure returns (bytes memory) {
        unchecked {
            uint256 size_ = 0;
            size_ += stackLength_.size();
            size_ += constants_.size();
            for (uint256 i_ = 0; i_ < ptrSources_.length; i_++) {
                size_ += ptrSources_[i_].size();
            }
            bytes memory packedBytes_ = new bytes(size_);
            StackTop cursor_ = packedBytes_.asStackTop().up();

            // Copy stack length.
            cursor_ = cursor_.push(stackLength_);

            // Then the constants.
            cursor_ = cursor_.pushWithLength(constants_);

            // Last the sources.
            for (uint256 i_ = 0; i_ < ptrSources_.length; i_++) {
                cursor_ = cursor_.unalignedPushWithLength(ptrSources_[i_]);
            }
            return packedBytes_;
        }
    }

    function toBytesPacked(VMState memory state_)
        internal
        pure
        returns (bytes memory)
    {
        return
            toBytesPacked(
                state_.stackBottom.peek(),
                state_.constantsBottom.down().asUint256Array(),
                state_.ptrSources
            );
    }

    /// Eval with sane defaults partially applied.
    function eval(VMState memory state_) internal view returns (StackTop) {
        return state_.eval(DEFAULT_SOURCE_INDEX, state_.stackBottom);
    }

    /// Eval with sane defaults partially applied.
    function eval(VMState memory state_, SourceIndex sourceIndex_)
        internal
        view
        returns (StackTop)
    {
        return state_.eval(sourceIndex_, state_.stackBottom);
    }

    /// Eval with sane defaults partially applied.
    function eval(VMState memory state_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return state_.eval(DEFAULT_SOURCE_INDEX, stackTop_);
    }

    /// Evaluates a rain script.
    /// The main workhorse of the rain VM, `eval` runs any core opcodes and
    /// dispatches anything it is unaware of to the implementing contract.
    /// For a script to be useful the implementing contract must override
    /// `applyOp` and dispatch non-core opcodes to domain specific logic. This
    /// could be mathematical operations for a calculator, tier reports for
    /// a membership combinator, entitlements for a minting curve, etc.
    ///
    /// Everything required to coordinate the execution of a rain script to
    /// completion is contained in the `State`. The context and source index
    /// are provided so the caller can provide additional data and kickoff the
    /// opcode dispatch from the correct source in `sources`.
    function eval(
        VMState memory state_,
        SourceIndex sourceIndex_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            assembly ("memory-safe") {
                cursor_ := mload(
                    add(
                        mload(add(state_, 0x60)),
                        add(0x20, mul(0x20, sourceIndex_))
                    )
                )
                end_ := add(cursor_, mload(cursor_))
            }

            // Loop until complete.
            while (cursor_ < end_) {
                function(VMState memory, Operand, StackTop)
                    internal
                    view
                    returns (StackTop) fn_;
                Operand operand_;
                cursor_ += 3;
                {
                    uint256 op_;
                    assembly ("memory-safe") {
                        op_ := and(mload(cursor_), 0xFFFFFF)
                        operand_ := and(op_, 0xFF)
                        fn_ := shr(8, op_)
                    }
                }
                stackTop_ = fn_(state_, operand_, stackTop_);
            }
            return stackTop_;
        }
    }
}