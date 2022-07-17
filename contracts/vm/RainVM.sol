// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../math/SaturatingMath.sol";
import "../type/LibCast.sol";
import "./LibStackTop.sol";
import "./LibVMState.sol";

struct StorageOpcodesRange {
    uint256 pointer;
    uint256 length;
}

/// @dev Copies a value either off `constants` to the top of the stack.
uint256 constant OPCODE_CONSTANT = 0;
/// @dev Duplicates any value in the stack to the top of the stack. The operand
/// specifies the index to copy from.
uint256 constant OPCODE_STACK = 1;
uint256 constant OPCODE_CONTEXT = 2;
uint256 constant OPCODE_STORAGE = 3;
/// @dev Takes N values off the stack, interprets them as an array then zips
/// and maps a source from `sources` over them.
uint256 constant OPCODE_ZIPMAP = 4;
/// @dev ABI encodes the entire stack and logs it to the hardhat console.
uint256 constant OPCODE_DEBUG = 5;
/// @dev Number of provided opcodes for `RainVM`.
uint256 constant RAIN_VM_OPS_LENGTH = 6;

/// @title RainVM
/// @notice micro VM for implementing and executing custom contract DSLs.
/// Libraries and contracts map opcodes to `view` functionality then RainVM
/// runs rain scripts using these opcodes. Rain scripts dispatch as pairs of
/// bytes. The first byte is an opcode to run and the second byte is a value
/// the opcode can use contextually to inform how to run. Typically opcodes
/// will read/write to the stack to produce some meaningful final state after
/// all opcodes have been dispatched.
///
/// The only thing required to run a rain script is a `State` struct to pass
/// to `eval`, and the index of the source to run. Additional context can
/// optionally be provided to be used by opcodes. For example, an `ITierV2`
/// contract can take the input of `report`, abi encode it as context, then
/// expose a local opcode that copies this account to the stack. The state will
/// be mutated by reference rather than returned by `eval`, this is to make it
/// very clear to implementers that the inline mutation is occurring.
///
/// Rain scripts run "top to bottom", i.e. "left to right".
/// See the tests for examples on how to construct rain script in JavaScript
/// then pass to `ImmutableSource` contracts deployed by a factory that then
/// run `eval` to produce a final value.
///
/// There are only 4 "core" opcodes for `RainVM`:
/// - `0`: Copy value from either `constants` at index `operand` to the top of
///   the stack.
/// - `1`: Duplicates the value at stack index `operand_` to the top of the
///   stack.
/// - `2`: Zipmap takes N values from the stack, interprets each as an array of
///   configurable length, then zips them into `arguments` and maps a source
///   from `sources` over these. See `zipmap` for more details.
/// - `3`: Debug prints the state to the console log as per hardhat.
///
/// To do anything useful the contract that inherits `RainVM` needs to provide
/// opcodes to build up an internal DSL. This may sound complex but it only
/// requires mapping opcode integers to functions to call, and reading/writing
/// values to the stack as input/output for these functions. Further, opcode
/// packs are provided in rain that any inheriting contract can use as a normal
/// solidity library. See `MathOps.sol` opcode pack and the
/// `CalculatorTest.sol` test contract for an example of how to dispatch
/// opcodes and handle the results in a wrapping contract.
///
/// RainVM natively has no concept of branching logic such as `if` or loops.
/// An opcode pack could implement these similar to the core zipmap by lazily
/// evaluating a source from `sources` based on some condition, etc. Instead
/// some simpler, eagerly evaluated selection tools such as `min` and `max` in
/// the `MathOps` opcode pack are provided. Future versions of `RainVM` MAY
/// implement lazy `if` and other similar patterns.
///
/// The `eval` function is `view` because rain scripts are expected to compute
/// results only without modifying any state. The contract wrapping the VM is
/// free to mutate as usual. This model encourages exposing only read-only
/// functionality to end-user deployers who provide scripts to a VM factory.
/// Removing all writes removes a lot of potential foot-guns for rain script
/// authors and allows VM contract authors to reason more clearly about the
/// input/output of the wrapping solidity code.
///
/// Internally `RainVM` makes heavy use of unchecked math and assembly logic
/// as the opcode dispatch logic runs on a tight loop and so gas costs can ramp
/// up very quickly.
abstract contract RainVM {
    using Math for uint256;
    using SaturatingMath for uint256;
    using LibCast for uint256;
    using LibVMState for VMState;

    /// Default is to disallow all storage access to opcodes.
    function storageOpcodesRange()
        public
        pure
        virtual
        returns (StorageOpcodesRange memory)
    {
        return StorageOpcodesRange(0, 0);
    }

    /// Expose all the function pointers for every opcode as 2-byte pointers in
    /// a bytes list. The implementing VM MUST ensure each pointer is to a
    /// `function(uint256,uint256) view returns (uint256)` function as this is
    /// the ONLY supported signature for opcodes. Pointers for the core opcodes
    /// must be provided in the packed pointers list but will be ignored at
    /// runtime.
    function packedFunctionPointers()
        public
        view
        virtual
        returns (bytes memory ptrs_);

    /// Zipmap is rain script's native looping construct.
    /// N values are taken from the stack as `uint256` then split into `uintX`
    /// values where X is configurable by `operand_`. Each 1 increment in the
    /// operand size config doubles the number of items in the implied arrays.
    /// For example, size 0 is 1 `uint256` value, size 1 is
    /// `2x `uint128` values, size 2 is 4x `uint64` values and so on.
    ///
    /// The implied arrays are zipped and then copied into `arguments` and
    /// mapped over with a source from `sources`. Each iteration of the mapping
    /// copies values into `arguments` from index `0` but there is no attempt
    /// to zero out any values that may already be in the `arguments` array.
    /// It is the callers responsibility to ensure that the `arguments` array
    /// is correctly sized and populated for the mapped source.
    ///
    /// The `operand_` for the zipmap opcode is split into 3 components:
    /// - 3 low bits: The index of the source to use from `sources`.
    /// - 2 middle bits: The size of the loop, where 0 is 1 iteration
    /// - 3 high bits: The number of vals to be zipped from the stack where 0
    ///   is 1 value to be zipped.
    ///
    /// This is a separate function to avoid blowing solidity compile stack.
    /// In the future it may be moved inline to `eval` for gas efficiency.
    ///
    /// See https://en.wikipedia.org/wiki/Zipping_(computer_science)
    /// See https://en.wikipedia.org/wiki/Map_(higher-order_function)
    /// @param context_ Domain specific context the wrapping contract can
    /// provide to passthrough back to its own opcodes.
    /// @param state_ The execution state of the VM.
    /// @param operand_ The operand_ associated with this dispatch to zipmap.
    function zipmap(
        uint256[] memory context_,
        VMState memory state_,
        StackTop stackTop_,
        uint256 operand_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 sourceIndex_ = operand_ & 0x07;
            uint256 loopSize_ = (operand_ >> 3) & 0x03;
            uint256 mask_;
            uint256 stepSize_;
            if (loopSize_ == 0) {
                mask_ = type(uint256).max;
                stepSize_ = 0x100;
            } else if (loopSize_ == 1) {
                mask_ = type(uint128).max;
                stepSize_ = 0x80;
            } else if (loopSize_ == 2) {
                mask_ = type(uint64).max;
                stepSize_ = 0x40;
            } else {
                mask_ = type(uint32).max;
                stepSize_ = 0x20;
            }
            uint256 valLength_ = (operand_ >> 5) + 1;

            // Set aside base values so they can't be clobbered during eval
            // as the stack changes on each loop.
            uint256[] memory baseVals_ = new uint256[](valLength_);
            uint256 baseValsBottom_;
            {
                assembly {
                    baseValsBottom_ := add(baseVals_, 0x20)
                    for {
                        let cursor_ := sub(stackTop_, mul(valLength_, 0x20))
                        let baseValsCursor_ := baseValsBottom_
                    } lt(cursor_, stackTop_) {
                        cursor_ := add(cursor_, 0x20)
                        baseValsCursor_ := add(baseValsCursor_, 0x20)
                    } {
                        mstore(baseValsCursor_, mload(cursor_))
                    }
                }
            }

            uint256 argumentsBottomLocation_;
            assembly {
                let constantsBottomLocation_ := add(
                    mload(add(state_, 0x60)),
                    0x20
                )
                argumentsBottomLocation_ := add(
                    constantsBottomLocation_,
                    mul(
                        0x20,
                        mload(
                            // argumentsIndex
                            add(state_, 0x80)
                        )
                    )
                )
            }

            for (uint256 step_ = 0; step_ < 0x100; step_ += stepSize_) {
                // Prepare arguments.
                {
                    // max cursor is in this scope to avoid stack overflow from
                    // solidity.
                    uint256 maxCursor_ = baseValsBottom_ + (valLength_ * 0x20);
                    uint256 argumentsCursor_ = argumentsBottomLocation_;
                    uint256 cursor_ = baseValsBottom_;
                    while (cursor_ < maxCursor_) {
                        assembly {
                            mstore(
                                argumentsCursor_,
                                and(shr(step_, mload(cursor_)), mask_)
                            )
                            cursor_ := add(cursor_, 0x20)
                            argumentsCursor_ := add(argumentsCursor_, 0x20)
                        }
                    }
                }
                stackTop_ = eval(context_, state_, sourceIndex_);
            }
            return stackTop_;
        }
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
        uint256[] memory context_,
        VMState memory state_,
        uint256 sourceIndex_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            uint256 opcode_;
            uint256 operand_;
            uint256 constantsBottomLocation_;
            uint256 stackBottomLocation_;
            StackTop stackTop_;
            uint256 firstFnPtrLocation_;

            assembly {
                let stackLocation_ := mload(add(state_, 0x20))
                stackBottomLocation_ := add(stackLocation_, 0x20)
                stackTop_ := add(
                    stackBottomLocation_,
                    // Add stack index offset.
                    mul(mload(state_), 0x20)
                )
                let sourceLocation_ := mload(
                    add(
                        mload(add(state_, 0x40)),
                        add(0x20, mul(sourceIndex_, 0x20))
                    )
                )
                cursor_ := sourceLocation_
                end_ := add(cursor_, mload(sourceLocation_))
                constantsBottomLocation_ := add(mload(add(state_, 0x60)), 0x20)
                // first fn pointer is seen if we move two bytes into the data.
                firstFnPtrLocation_ := add(mload(add(state_, 0xA0)), 0x02)
            }

            // Loop until complete.
            while (cursor_ < end_) {
                assembly {
                    cursor_ := add(cursor_, 3)
                    let op_ := and(mload(cursor_), 0xFFFFFF)
                    operand_ := and(op_, 0xFF)
                    opcode_ := shr(8, op_)
                }

                if (opcode_ < RAIN_VM_OPS_LENGTH) {
                    if (opcode_ == OPCODE_CONSTANT) {
                        assembly {
                            mstore(
                                stackTop_,
                                mload(
                                    add(
                                        constantsBottomLocation_,
                                        mul(0x20, operand_)
                                    )
                                )
                            )
                            stackTop_ := add(stackTop_, 0x20)
                        }
                    } else if (opcode_ == OPCODE_STACK) {
                        assembly {
                            mstore(
                                stackTop_,
                                mload(
                                    add(
                                        stackBottomLocation_,
                                        mul(operand_, 0x20)
                                    )
                                )
                            )
                            stackTop_ := add(stackTop_, 0x20)
                        }
                    } else if (opcode_ == OPCODE_CONTEXT) {
                        // This is the only runtime integrity check that we do
                        // as it is not possible to know how long context might
                        // be in general until runtime.
                        require(operand_ < context_.length, "CONTEXT_LENGTH");
                        assembly {
                            mstore(
                                stackTop_,
                                mload(
                                    add(
                                        context_,
                                        add(0x20, mul(0x20, operand_))
                                    )
                                )
                            )
                            stackTop_ := add(stackTop_, 0x20)
                        }
                    } else if (opcode_ == OPCODE_STORAGE) {
                        StorageOpcodesRange
                            memory storageOpcodesRange_ = storageOpcodesRange();
                        assembly {
                            mstore(
                                stackTop_,
                                sload(
                                    add(operand_, mload(storageOpcodesRange_))
                                )
                            )
                            stackTop_ := add(stackTop_, 0x20)
                        }
                    } else if (opcode_ == OPCODE_ZIPMAP) {
                        stackTop_ = zipmap(
                            context_,
                            state_,
                            stackTop_,
                            operand_
                        );
                    } else {
                        state_.debug(DebugStyle(operand_));
                    }
                } else {
                    stackTop_ = opcode_.asOpFn()(operand_, stackTop_);
                }
                // The stack index may be the same as the length as this means
                // the stack is full. But we cannot write past the end of the
                // stack. This also catches a stack index that underflows due
                // to unchecked or assembly math. This check MAY be redundant
                // with standard OOB checks on the stack array due to indexing
                // into it, but is a required guard in the case of VM assembly.
                // Future versions of the VM will precalculate all stack
                // movements at deploy time rather than runtime as this kind of
                // accounting adds nontrivial gas across longer scripts that
                // include many opcodes.
                // Note: This check would NOT be safe in the case that some
                // opcode used assembly in a way that can underflow the stack
                // as this would allow a malicious rain script to write to the
                // stack length and/or the stack index.
                require(
                    state_.stackIndex <= state_.stack.length,
                    "STACK_OVERFLOW"
                );
            }
            state_.stackIndex =
                (StackTop.unwrap(stackTop_) - stackBottomLocation_) /
                0x20;
            return stackTop_;
        }
    }
}
