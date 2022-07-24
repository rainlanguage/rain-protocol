// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./LibStackTop.sol";
import "hardhat/console.sol";

enum DebugStyle {
    StateAbi,
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
    uint256[] stack;
    uint256[] constants;
    uint256[] context;
    bytes[] ptrSources;
}

library LibVMState {
    using LibVMState for VMState;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;

    function stackTopToIndex(VMState memory state_, StackTop stackTop_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            return
                (StackTop.unwrap(stackTop_) -
                    StackTop.unwrap(state_.stack.asStackTopUp())) / 0x20;
        }
    }

    function debug(
        VMState memory state_,
        StackTop stackTop_,
        DebugStyle debugStyle_
    ) internal view {
        if (debugStyle_ == DebugStyle.StateAbi) {
            console.logBytes(abi.encode(state_));
        } else if (debugStyle_ == DebugStyle.StatePacked) {
            console.logBytes(state_.toBytesPacked());
        } else if (debugStyle_ == DebugStyle.Stack) {
            console.log("~stack~");
            console.log("idx: %s", state_.stackTopToIndex(stackTop_));
            unchecked {
                for (uint256 i_ = 0; i_ < state_.stack.length; i_++) {
                    console.log(i_, state_.stack[i_]);
                }
            }
            console.log("~~~~~");
        } else if (debugStyle_ == DebugStyle.StackIndex) {
            console.log(state_.stackTopToIndex(stackTop_));
        }
    }

    function fromBytesPacked(
        bytes memory stateBytes_,
        uint256[] memory context_
    ) internal pure returns (VMState memory) {
        unchecked {
            VMState memory state_;
            state_.context = context_;
            uint256 indexes_;
            assembly ("memory-safe") {
                // Load indexes from state bytes.
                indexes_ := mload(add(stateBytes_, 0x20))
                // mask out everything but the constants length from state
                // bytes.
                mstore(add(stateBytes_, 0x20), and(indexes_, 0xFF))
                // point state constants at state bytes
                mstore(add(state_, 0x20), add(stateBytes_, 0x20))
            }
            state_.stack = new uint256[]((indexes_ >> 8) & 0xFF);
            uint256 sourcesLen_ = (indexes_ >> 16) & 0xFF;
            bytes[] memory ptrSources_;
            uint256[] memory ptrSourcesPtrs_ = new uint256[](sourcesLen_);

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
                } lt(i_, sourcesLen_) {
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
            uint256[] memory constants_ = state_.constants;
            // constants is first so we can literally use it on the other end
            uint256 indexes_ = state_.constants.length |
                (state_.stack.length << 8) |
                (state_.ptrSources.length << 16);
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
