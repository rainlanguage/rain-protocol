// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "../../type/LibCast.sol";
import "../../array/LibUint256Array.sol";
import "../../memory/LibMemorySize.sol";
import "hardhat/console.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

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
    bytes[] sources;
    function(VMState memory, SourceIndex, StackTop)
        view
        returns (StackTop) eval;
}

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
    using LibCast for function(VMState memory, Operand, StackTop) view returns (StackTop)[];

    function fromBytesPacked(
        bytes memory stateBytes_,
        uint256[] memory context_,
        function(VMState memory, SourceIndex, StackTop)
            internal
            view
            returns (StackTop) eval_
    ) internal pure returns (VMState memory) {
        unchecked {
            VMState memory state_;

            // Context and the eval pointer are provided by the caller so no
            // processing is needed for these.
            state_.context = context_;
            state_.eval = eval_;

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
            state_.sources = new bytes[](sourcesLength_);
            while (StackTop.unwrap(cursor_) < StackTop.unwrap(end_)) {
                state_.sources[i_] = cursor_.asBytes();
                cursor_ = cursor_.upBytes(cursor_.peekUp()).up();
                i_++;
            }
            return state_;
        }
    }

    function replaceSourceIndexesWithPointers(bytes memory source_, uint[] memory pointers_) internal pure {
        assembly ("memory-safe") {
            for {
                let replaceMask_ := 0xFFFF
                let preserveMask_ := not(replaceMask_)
                let sourceLength_ := mload(source_)
                let pointersBottom_ := add(pointers_, 0x20)
                let cursor_ := add(source_, 2)
                let end_ := add(source_, sourceLength_)
            }
            lt(cursor_, end_)
            {
                cursor_ := add(cursor_, 4)
            }
            {
                let data_ := mload(cursor_)
                mstore(cursor_, or(and(data_, preserveMask_), mload(
                    add(
                        pointersBottom_, 
                        mul(and(data_, replaceMask_), 0x20)))))
            }
        }
    }

    function toBytesPacked(
        uint256 stackLength_,
        uint256[] memory constants_,
        bytes[] memory sources_,
                    function(VMState memory, Operand, StackTop)
                internal
                view
                returns (StackTop)[]
                memory opcodeFunctionPointers_
    ) internal pure returns (bytes memory) {
        unchecked {
            uint size_ = 0;
            size_ += stackLength_.size();
            size_ += constants_.size();
            for (uint i_ = 0; i_ < sources_.length; i_++) {
                size_ += sources_[i_].size();
            }
            bytes memory packedBytes_ = new bytes(size_);
            StackTop cursor_ = packedBytes_.asStackTop().up();

            // Copy stack length.
            cursor_ = cursor_.push(stackLength_);

            // Then the constants.
            cursor_ = cursor_.pushWithLength(constants_);

            // Last the sources.
            bytes memory source_;
            for (uint256 i_ = 0; i_ < sources_.length; i_++) {
                source_ = sources_[i_];
                replaceSourceIndexesWithPointers(source_, opcodeFunctionPointers_.asUint256Array());
                cursor_ = cursor_.unalignedPushWithLength(source_);
            }
            return packedBytes_;
        }
    }
}
