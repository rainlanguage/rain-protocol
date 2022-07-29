// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "../../type/LibCast.sol";
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
        uint16 evalPointer_,
        uint8 ptrSourcesLength_,
        uint8 stackLength_,
        uint8 constantsLength_
    ) internal pure returns (uint256) {
        return
            (uint256(evalPointer_) << 24) |
            (uint256(ptrSourcesLength_) << 16) |
            (uint256(stackLength_) << 8) |
            uint256(constantsLength_);
    }

    function fromIndexes(uint256 indexes_)
        internal
        pure
        returns (
            uint256 evalPointer_,
            uint256 ptrSourcesLength_,
            uint256 stackLength_,
            uint256 constantsLength_
        )
    {
        evalPointer_ = indexes_ >> 24;
        ptrSourcesLength_ = (indexes_ >> 16) & 0xFF;
        stackLength_ = (indexes_ >> 8) & 0xFF;
        constantsLength_ = indexes_ & 0xFF;
    }

    function fromBytesPacked(
        bytes memory stateBytes_,
        uint256[] memory context_
    ) internal pure returns (VMState memory) {
        unchecked {
            VMState memory state_;
            state_.context = context_;

            state_.constantsBottom = stateBytes_.asStackTop().up(2);
            uint256 indexes_ = state_.constantsBottom.peek();
            (
                uint256 evalPointer_,
                uint256 ptrSourcesLength_,
                uint256 stackLength_,
                uint256 constantsLength_
            ) = fromIndexes(indexes_);
            state_.constantsBottom.down().set(constantsLength_);

            state_.stackBottom = (new uint256[](stackLength_)).asStackTopUp();
            bytes[] memory ptrSources_;
            uint256[] memory ptrSourcesPtrs_ = new uint256[](ptrSourcesLength_);

            assembly ("memory-safe") {
                let sourcesStart_ := add(
                    stateBytes_,
                    add(
                        // 0x40 for constants and state array length
                        0x40,
                        // skip over length of constants
                        mul(0x20, mload(add(stateBytes_, 0x20)))
                    )
                )
                let cursor_ := sourcesStart_

                for {
                    let i_ := 0
                } lt(i_, ptrSourcesLength_) {
                    i_ := add(i_, 1)
                } {
                    // sources_ is a dynamic array so it is a list of
                    // pointers that can be set literally to the cursor_
                    mstore(
                        add(ptrSourcesPtrs_, add(0x20, mul(i_, 0x20))),
                        cursor_
                    )
                    // move the cursor by the length of the source in bytes
                    cursor_ := add(cursor_, add(0x20, mload(cursor_)))
                }
                // point state at sources_ rather than clone in memory
                ptrSources_ := ptrSourcesPtrs_
                mstore(add(state_, 0x60), ptrSources_)
            }
            state_.eval = evalPointer_.asEvalFunctionPointer();
            return state_;
        }
    }

    function toBytesPacked(VMState memory state_)
        internal
        pure
        returns (bytes memory)
    {
        unchecked {
            // indexes + constants
            uint256[] memory constants_ = state_
                .constantsBottom
                .down()
                .asUint256Array();
            // constants is first so we can literally use it on the other end
            uint256 indexes_ = toIndexes(
                state_.eval.asUint256().toUint16(),
                state_.ptrSources.length.toUint8(),
                state_.stackBottom.peek().toUint8(),
                constants_.length.toUint8()
            );
            bytes memory ret_ = bytes.concat(
                bytes32(indexes_),
                abi.encodePacked(constants_)
            );
            for (uint256 i_ = 0; i_ < state_.ptrSources.length; i_++) {
                ret_ = bytes.concat(
                    ret_,
                    bytes32(state_.ptrSources[i_].length),
                    state_.ptrSources[i_]
                );
            }
            return ret_;
        }
    }
}
