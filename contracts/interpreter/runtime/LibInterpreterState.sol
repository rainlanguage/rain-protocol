// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "../../type/LibCast.sol";
import "../../array/LibUint256Array.sol";
import "../../memory/LibMemorySize.sol";
import "hardhat/console.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {SourceIndex, Operand} from "./RainInterpreter.sol";

enum DebugStyle {
    Stack,
    Constant,
    Context,
    Source
}

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

/// Everything required to evaluate and track the state of a Rain expression.
/// As this is a struct it will be in memory when passed to `RainInterpreter` and so
/// will be modified by reference internally. This is important for gas
/// efficiency; the stack, arguments and stackIndex will likely be mutated by
/// the running expression.
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
struct InterpreterState {
    StackTop stackBottom;
    StackTop constantsBottom;
    uint256 scratch;
    uint256 contextScratch;
    uint256[][] context;
    bytes[] compiledSources;
}

string constant DEBUG_DELIMETER = "~~~";

SourceIndex constant DEFAULT_SOURCE_INDEX = SourceIndex.wrap(0);

library LibInterpreterState {
    using SafeCast for uint256;
    using LibMemorySize for uint256;
    using LibMemorySize for uint256[];
    using LibMemorySize for bytes;
    using LibUint256Array for uint256[];
    using LibUint256Array for uint256;
    using LibInterpreterState for InterpreterState;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibStackTop for bytes;
    using LibCast for uint256;
    using LibCast for function(InterpreterState memory, SourceIndex, StackTop)
        view
        returns (StackTop);
    using LibCast for function(InterpreterState memory, Operand, StackTop)
        view
        returns (StackTop)[];

    function debugArray(uint256[] memory array_) internal view {
        console.log(DEBUG_DELIMETER);
        for (uint256 i_ = 0; i_ < array_.length; i_++) {
            console.log(i_, array_[i_]);
        }
        console.log(DEBUG_DELIMETER);
    }

    function debugStack(StackTop stackBottom_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        uint256 length_ = stackBottom_.toIndex(stackTop_);
        debugArray(
            StackTop.unwrap(stackTop_.down(length_)).copyToNewUint256Array(
                length_
            )
        );
        return stackTop_;
    }

    function debugStack(InterpreterState memory state_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return debugStack(state_.stackBottom, stackTop_);
    }

    /// Console log various aspects of the Interpreter state.
    /// Gas intensive and relies on hardhat console so not intended for
    /// production but great for debugging Rain expressions.
    function debug(
        InterpreterState memory state_,
        StackTop stackTop_,
        DebugStyle debugStyle_
    ) internal view returns (StackTop) {
        if (debugStyle_ == DebugStyle.Source) {
            for (uint256 i_ = 0; i_ < state_.compiledSources.length; i_++) {
                console.logBytes(state_.compiledSources[i_]);
            }
        } else {
            if (debugStyle_ == DebugStyle.Stack) {
                state_.debugStack(stackTop_);
            } else if (debugStyle_ == DebugStyle.Constant) {
                debugArray(state_.constantsBottom.down().asUint256Array());
            } else {
                for (uint256 i_ = 0; i_ < state_.context.length; i_++) {
                    debugArray(state_.context[i_]);
                }
            }
        }
        return stackTop_;
    }

    function serialize(
        StateConfig memory config_,
        uint256 scratch_,
        uint256 contextScratch_,
        uint256 stackLength_,
        function(InterpreterState memory, Operand, StackTop)
            internal
            view
            returns (StackTop)[]
            memory opcodeFunctionPointers_
    ) internal pure returns (bytes memory) {
        unchecked {
            uint256 size_ = 0;
            size_ += scratch_.size();
            size_ += contextScratch_.size();
            size_ += stackLength_.size();
            size_ += config_.constants.size();
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
                size_ += config_.sources[i_].size();
            }
            bytes memory serialized_ = new bytes(size_);
            StackTop cursor_ = serialized_.asStackTop().up();

            // Copy stack length.
            cursor_ = cursor_.push(stackLength_);

            // Then the constants.
            cursor_ = cursor_.pushWithLength(config_.constants);

            // Copy scratch.
            cursor_ = cursor_.push(scratch_);

            // Copy context scratch.
            cursor_ = cursor_.push(contextScratch_);

            // Last the sources.
            bytes memory source_;
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
                source_ = config_.sources[i_];
                compile(source_, opcodeFunctionPointers_.asUint256Array());
                cursor_ = cursor_.unalignedPushWithLength(source_);
            }
            return serialized_;
        }
    }

    function deserialize(bytes memory serialized_)
        internal
        pure
        returns (InterpreterState memory)
    {
        unchecked {
            InterpreterState memory state_;

            // Context will probably be overridden by the caller according to the
            // context scratch that we deserialize so best to just set it empty
            // here.
            state_.context = new uint256[][](0);

            StackTop cursor_ = serialized_.asStackTop().up();
            // The end of processing is the end of the state bytes.
            StackTop end_ = cursor_.upBytes(cursor_.peek());

            // Read the stack length and build a stack.
            cursor_ = cursor_.up();
            uint256 stackLength_ = cursor_.peek();

            // The stack is never stored in stack bytes so we allocate a new
            // array for it with length as per the indexes and point the state
            // at it.
            uint256[] memory stack_ = new uint256[](stackLength_);
            state_.stackBottom = stack_.asStackTopUp();

            // Reference the constants array and move cursor past it.
            cursor_ = cursor_.up();
            state_.constantsBottom = cursor_;
            cursor_ = cursor_.up(cursor_.peek());

            cursor_ = cursor_.up();
            state_.scratch = cursor_.peek();

            cursor_ = cursor_.up();
            state_.contextScratch = cursor_.peek();

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
            state_.compiledSources = new bytes[](sourcesLength_);
            while (StackTop.unwrap(cursor_) < StackTop.unwrap(end_)) {
                state_.compiledSources[i_] = cursor_.asBytes();
                cursor_ = cursor_.upBytes(cursor_.peekUp()).up();
                i_++;
            }
            return state_;
        }
    }

    /// Given a source in opcodes compile to an equivalent source with real
    /// function pointers for a given Interpreter contract. The "compilation"
    /// involves simply replacing the opcode with the pointer at the index of
    /// the opcode. i.e. opcode 4 will be replaced with `pointers_[4]`.
    /// Relies heavily on the integrity checks ensuring opcodes used are not OOB
    /// and that the pointers provided are valid and in the correct order.
    /// Hopefully it goes without saying that the list of pointers MUST NOT be
    /// user defined, otherwise any source can be compiled with a completely
    /// different mapping between opcodes and dispatched functions.
    function compile(bytes memory source_, uint256[] memory pointers_)
        internal
        pure
    {
        assembly ("memory-safe") {
            for {
                let replaceMask_ := 0xFFFF
                let preserveMask_ := not(replaceMask_)
                let sourceLength_ := mload(source_)
                let pointersBottom_ := add(pointers_, 0x20)
                let cursor_ := add(source_, 2)
                let end_ := add(source_, sourceLength_)
            } lt(cursor_, end_) {
                cursor_ := add(cursor_, 4)
            } {
                let data_ := mload(cursor_)
                mstore(
                    cursor_,
                    or(
                        and(data_, preserveMask_),
                        mload(
                            add(
                                pointersBottom_,
                                mul(and(data_, replaceMask_), 0x20)
                            )
                        )
                    )
                )
            }
        }
    }

    /// Eval with sane defaults partially applied.
    function eval(InterpreterState memory state_)
        internal
        view
        returns (StackTop)
    {
        return state_.eval(DEFAULT_SOURCE_INDEX, state_.stackBottom);
    }

    /// Eval with sane defaults partially applied.
    function eval(InterpreterState memory state_, SourceIndex sourceIndex_)
        internal
        view
        returns (StackTop)
    {
        return state_.eval(sourceIndex_, state_.stackBottom);
    }

    /// Eval with sane defaults partially applied.
    function eval(InterpreterState memory state_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return state_.eval(DEFAULT_SOURCE_INDEX, stackTop_);
    }

    /// Evaluates a Rain expression.
    /// The main workhorse of the rain Interpreter, `eval` runs any core opcodes
    /// and dispatches anything it is unaware of to the implementing contract.
    /// For an expression to be useful the implementing contract must override
    /// `applyOp` and dispatch non-core opcodes to domain specific logic. This
    /// could be mathematical operations for a calculator, tier reports for
    /// a membership combinator, entitlements for a minting curve, etc.
    ///
    /// Everything required to coordinate the execution of a Rain expression to
    /// completion is contained in the `State`. The context and source index
    /// are provided so the caller can provide additional data and kickoff the
    /// opcode dispatch from the correct source in `sources`.
    function eval(
        InterpreterState memory state_,
        SourceIndex sourceIndex_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            assembly ("memory-safe") {
                cursor_ := mload(
                    add(
                        mload(add(state_, 0xA0)),
                        add(0x20, mul(0x20, sourceIndex_))
                    )
                )
                end_ := add(cursor_, mload(cursor_))
            }

            // Loop until complete.
            while (cursor_ < end_) {
                function(InterpreterState memory, Operand, StackTop)
                    internal
                    view
                    returns (StackTop) fn_;
                Operand operand_;
                cursor_ += 4;
                {
                    uint256 op_;
                    assembly ("memory-safe") {
                        op_ := mload(cursor_)
                        operand_ := and(op_, 0xFFFF)
                        fn_ := and(shr(16, op_), 0xFFFF)
                    }
                }
                stackTop_ = fn_(state_, operand_, stackTop_);
            }
            return stackTop_;
        }
    }
}
