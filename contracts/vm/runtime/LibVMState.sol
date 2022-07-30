// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "../../type/LibCast.sol";
import "../../array/LibUint256Array.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

enum DebugStyle {
    StatePacked,
    Stack,
    StackIndex
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
    function(VMState memory, SourceIndex, StackTop)
        view
        returns (StackTop) eval;
}

library LibVMState {
    using SafeCast for uint256;

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
            uint256[] memory stack_ = state_
                .stackBottom
                .down()
                .asUint256Array();
            console.log("~stack~");
            console.log("idx: %s", state_.stackBottom.toIndex(stackTop_));
            unchecked {
                for (uint256 i_ = 0; i_ < stack_.length; i_++) {
                    console.log(i_, stack_[i_]);
                }
            }
            console.log("~~~~~");
        } else if (debugStyle_ == DebugStyle.StackIndex) {
            console.log(state_.stackBottom.toIndex(stackTop_));
        }
        return stackTop_;
    }

    function toIndexes(
        uint8 stackLength_,
        uint8 constantsLength_
    ) internal pure returns (uint256) {
        return
            (uint256(stackLength_) << 8) |
            uint256(constantsLength_);
    }

    function fromIndexes(uint256 indexes_)
        internal
        pure
        returns (
            uint256 stackLength_,
            uint256 constantsLength_
        )
    {
        stackLength_ = (indexes_ >> 8) & 0xFF;
        constantsLength_ = indexes_ & 0xFF;
    }

    function fromBytesPacked(
        bytes memory stateBytes_,
        uint256[] memory context_,
        function(VMState memory, SourceIndex, StackTop)
            internal
            view
            returns (StackTop) eval_
    ) internal view returns (VMState memory) {
        unchecked {
            VMState memory state_;

            // Context and the eval pointer are provided by the caller so no
            // processing is needed for these.
            state_.context = context_;
            state_.eval = eval_;

            // Move cursor to where constants will be after we process the
            // indexes.
            StackTop cursor_ = stateBytes_.asStackTop();
            StackTop end_ = cursor_.upBytes(cursor_.peekUp()).up();
            cursor_ = cursor_.up();
            uint256 indexes_ = cursor_.peekUp();
            (
                uint256 stackLength_,
                uint256 constantsLength_
            ) = fromIndexes(indexes_);

            // Set the constants length to the correct value so it restores the
            // valid uint[] for constants.
            cursor_ = cursor_.push(constantsLength_);
            state_.constantsBottom = cursor_;

            // The stack is never stored in stack bytes so we allocate a new
            // array for it with length as per the indexes and point the state
            // at it.
            state_.stackBottom = (new uint256[](stackLength_)).asStackTopUp();

            // Rehydrate the sources array.
            cursor_ = cursor_.up(constantsLength_);
            uint i_ = 0;
            StackTop lengthCursor_ = cursor_;
            uint sourcesLength_ = 0;
            while (StackTop.unwrap(lengthCursor_) < StackTop.unwrap(end_)) {
                lengthCursor_ = lengthCursor_.upBytes(lengthCursor_.peekUp()).up();
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

    function unsafeCopyBytes(
        uint256 inputCursor_,
        uint256 outputCursor_,
        uint256 remaining_
    ) internal pure {
        assembly ("memory-safe") {
            for {} iszero(lt(remaining_, 0x20)) {
                remaining_ := sub(remaining_, 0x20)
                inputCursor_ := add(inputCursor_, 0x20)
                outputCursor_ := add(outputCursor_, 0x20)
                } {
                    mstore(outputCursor_, mload(inputCursor_))
            }

            if gt(remaining_, 0) {
                let mask_ := shr(mul(remaining_, 8), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
                // preserve existing bytes
                mstore(outputCursor_, or(
                    // input
                    and(mload(inputCursor_), not(mask_)),
                    and(mload(outputCursor_), mask_)))
            }
        }
    }

    function toBytesPacked(
        uint256[] memory constants_,
        bytes[] memory ptrSources_,
        uint256 stackLength_
    ) internal view returns (bytes memory) {
        unchecked {
            uint256 indexes_ = toIndexes(
                stackLength_.toUint8(),
                constants_.length.toUint8()
            );

            uint256 packedBytesLength_ = 0x20 + (constants_.length * 0x20);
            for (uint256 i_ = 0; i_ < ptrSources_.length; i_++) {
                packedBytesLength_ += ptrSources_[i_].length + 0x20;
            }

            bytes memory packedBytes_ = new bytes(packedBytesLength_);
            StackTop cursor_ = packedBytes_.asStackTop().up();

            // First copy indexes
            cursor_ = cursor_.push(indexes_);

            // Then the constants
            constants_.unsafeCopyValuesTo(StackTop.unwrap(cursor_));
            cursor_ = cursor_.up(constants_.length);

            // Last the sources.
            for (uint256 i_ = 0; i_ < ptrSources_.length; i_++) {
                cursor_ = cursor_.push(ptrSources_[i_].length);
                unsafeCopyBytes(
                    StackTop.unwrap(ptrSources_[i_].asStackTop().up()),
                    StackTop.unwrap(cursor_),
                    ptrSources_[i_].length
                );
                // Bit of a hack, just forcing the cursor to a new location
                // works for bytes but isn't really in the spirit of StackTop.
                cursor_ = StackTop.wrap(
                    StackTop.unwrap(cursor_) + ptrSources_[i_].length
                );
            }
            return packedBytes_;
        }
    }

    function toBytesPacked(VMState memory state_)
        internal
        view
        returns (bytes memory)
    {
        return
            toBytesPacked(
                state_.constantsBottom.down().asUint256Array(),
                state_.ptrSources,
                state_.stackBottom.peek()
            );
    }
}
