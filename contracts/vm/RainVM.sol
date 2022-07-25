// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../math/SaturatingMath.sol";
import "../type/LibCast.sol";
import "./LibStackTop.sol";
import "./LibVMState.sol";
import "../array/LibUint256Array.sol";

struct StorageOpcodesRange {
    uint256 pointer;
    uint256 length;
}

/// @dev Copies a value either off `constants` to the top of the stack.
uint256 constant OPCODE_MEMORY = 0;

uint256 constant OPCODE_MEMORY_TYPE_STACK = 0;
uint256 constant OPCODE_MEMORY_TYPE_CONSTANT = 1;
uint256 constant OPCODE_MEMORY_TYPE_CONTEXT = 2;

uint256 constant OPCODE_CALL = 1;
uint256 constant OPCODE_LOOP_N = 2;
uint256 constant OPCODE_LOOP_IF = 3;

/// @dev Duplicates any value in the stack to the top of the stack. The operand
/// specifies the index to copy from.
// uint256 constant OPCODE_STACK = 1;

// uint256 constant OPCODE_CONTEXT = 2;

uint256 constant OPCODE_STORAGE = 4;

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
    using LibStackTop for uint256[];
    using LibStackTop for bytes;
    using LibStackTop for StackTop;

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

    function eval(VMState memory state_, uint256 sourceIndex_)
        internal
        view
        returns (StackTop)
    {
        return eval(state_, sourceIndex_, state_.stackBottom);
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
        uint256 sourceIndex_,
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
                uint256 opcode_;
                uint256 operand_;
                cursor_ += 3;
                {
                    uint256 op_;
                    assembly ("memory-safe") {
                        op_ := mload(cursor_)
                    }
                    op_ &= 0xFFFFFF;
                    operand_ = op_ & 0xFF;
                    opcode_ = op_ >> 8;
                }

                if (opcode_ == OPCODE_MEMORY) {
                    assembly ("memory-safe") {
                        let type_ := and(operand_, 0x3)
                        let offset_ := shr(2, operand_)
                        mstore(
                            stackTop_,
                            mload(
                                add(
                                    mload(add(state_, mul(0x20, type_))),
                                    mul(0x20, offset_)
                                )
                            )
                        )
                        stackTop_ := add(stackTop_, 0x20)
                    }
                } else if (opcode_ >= RAIN_VM_OPS_LENGTH) {
                    stackTop_ = opcode_.asOpFn()(state_, operand_, stackTop_);
                } else if (opcode_ == OPCODE_CALL) {
                    uint256 inputs_ = operand_ & 0x7;
                    uint256 outputs_ = (operand_ >> 3) & 0x3;
                    uint256 callSourceIndex_ = (operand_ >> 5) & 0x7;
                    stackTop_ = stackTop_.down(inputs_);
                    StackTop stackTopAfter_ = eval(
                        state_,
                        callSourceIndex_,
                        stackTop_
                    );
                    LibUint256Array.unsafeCopyValuesTo(
                        StackTop.unwrap(stackTopAfter_.down(outputs_)),
                        StackTop.unwrap(stackTop_),
                        outputs_
                    );
                    stackTop_ = stackTop_.up(outputs_);
                } else if (opcode_ == OPCODE_LOOP_N) {
                    uint256 n_ = operand_ & 0x0F;
                    uint256 loopSourceIndex_ = (operand_ & 0xF0) >> 4;
                    for (uint256 i_ = 0; i_ <= n_; i_++) {
                        stackTop_ = eval(state_, loopSourceIndex_, stackTop_);
                    }
                } else if (opcode_ == OPCODE_LOOP_IF) {
                    while (stackTop_.peek() > 0) {
                        // LOOP_IF is NOT allowed to change the stack top so we
                        // ignore the return of eval. This is enforced by bounds
                        // checks.
                        eval(state_, operand_, stackTop_.down());
                    }
                    stackTop_ = stackTop_.down();
                } else if (opcode_ == OPCODE_STORAGE) {
                    StorageOpcodesRange
                        memory storageOpcodesRange_ = storageOpcodesRange();
                    assembly ("memory-safe") {
                        mstore(
                            stackTop_,
                            sload(add(operand_, mload(storageOpcodesRange_)))
                        )
                    }
                    stackTop_ = stackTop_.up();
                } else {
                    state_.debug(stackTop_, DebugStyle(operand_));
                }
            }
            return stackTop_;
        }
    }
}
