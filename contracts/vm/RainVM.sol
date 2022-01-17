// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

/// Everything required to evaluate and track the state of a rain script.
/// As this is a struct it will be in memory when passed to `RainVM` and so
/// will be modified by reference internally. This is important for gas
/// efficiency; the stack, arguments and stackIndex will likely be mutated by
/// the running script.
struct State {
    /// Opcodes write to the stack at the stack index and can consume from the
    /// stack by decrementing the index and reading between the old and new
    /// stack index.
    /// IMPORANT: The stack is never zeroed out so the index must be used to
    /// find the "top" of the stack as the result of an `eval`.
    uint256 stackIndex;
    /// Stack is the general purpose runtime state that opcodes can read from
    /// and write to according to their functionality.
    uint256[] stack;
    /// Sources available to be executed by `eval`.
    /// Notably `ZIPMAP` can also select a source to execute by index.
    bytes[] sources;
    /// Constants that can be copied to the stack by index by `VAL`.
    uint256[] constants;
    /// `ZIPMAP` populates arguments which can be copied to the stack by `VAL`.
    uint256[] arguments;
}

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
/// optionally be provided to be used by opcodes. For example, an `ITier`
/// contract can take the input of `report`, abi encode it as context, then
/// expose a local opcode that copies this account to the stack. The state will
/// be mutated by reference rather than returned by `eval`, this is to make it
/// very clear to implementers that the inline mutation is occurring.
///
/// Rain scripts run "bottom to top", i.e. "right to left"!
/// See the tests for examples on how to construct rain script in JavaScript
/// then pass to `ImmutableSource` contracts deployed by a factory that then
/// run `eval` to produce a final value.
///
/// There are only 3 "core" opcodes for `RainVM`:
/// - `0`: Skip self and optionally additional opcodes, `0 0` is a noop
/// - `1`: Copy value from either `constants` or `arguments` at index `operand`
///   to the top of the stack. High bit of `operand` is `0` for `constants` and
///   `1` for `arguments`.
/// - `2`: Zipmap takes N values from the stack, interprets each as an array of
///   configurable length, then zips them into `arguments` and maps a source
///   from `sources` over these. See `zipmap` for more details.
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
/// Removing all writes remotes a lot of potential foot-guns for rain script
/// authors and allows VM contract authors to reason more clearly about the
/// input/output of the wrapping solidity code.
///
/// Internally `RainVM` makes heavy use of unchecked math and assembly logic
/// as the opcode dispatch logic runs on a tight loop and so gas costs can ramp
/// up very quickly. Implementing contracts and opcode packs SHOULD require
/// that opcodes they receive do not exceed the codes they are expecting.
abstract contract RainVM {
    /// `0` is a skip as this is the fallback value for unset solidity bytes.
    /// Any additional "whitespace" in rain scripts will be noops as `0 0` is
    /// "skip self". The val can be used to skip additional opcodes but take
    /// care to not underflow the source itself.
    uint256 private constant OP_SKIP = 0;
    /// `1` copies a value either off `constants` or `arguments` to the top of
    /// the stack. The high bit of the operand specifies which, `0` for
    /// `constants` and `1` for `arguments`.
    uint256 private constant OP_VAL = 1;
    /// `2` takes N values off the stack, interprets them as an array then zips
    /// and maps a source from `sources` over them. The source has access to
    /// the original constants using `1 0` and to zipped arguments as `1 1`.
    uint256 private constant OP_ZIPMAP = 2;
    /// Number of provided opcodes for `RainVM`.
    uint256 internal constant OPS_LENGTH = 3;

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
    /// - 2 low bits: The index of the source to use from `sources`.
    /// - 3 middle bits: The size of the loop, where 0 is 1 iteration
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
        bytes memory context_,
        State memory state_,
        uint256 operand_
    ) internal view {
        unchecked {
            uint256 sourceIndex_;
            uint256 stepSize_;
            uint256 offset_;
            uint256 valLength_;
            // assembly here to shave some gas.
            assembly {
                // rightmost 2 bits are the index of the source to use from
                // sources in `state_`.
                sourceIndex_ := and(operand_, 0x03)
                // bits 2-5 indicate size of the loop. Each 1 increment of the
                // size halves the bits of the arguments to the zipmap.
                // e.g. 256 `stepSize_` would copy all 256 bits of the uint256
                // into args for the inner `eval`. A loop size of `1` would
                // shift `stepSize_` by 1 (halving it) and meaning the uint256
                // is `eval` as 2x 128 bit values (runs twice). A loop size of
                // `2` would run 4 times as 64 bit values, and so on.
                //
                // Slither false positive here for the shift of constant `256`.
                // slither-disable-next-line incorrect-shift
                stepSize_ := shr(and(shr(2, operand_), 0x07), 256)
                // `offset_` is used by the actual bit shifting operations and
                // is precalculated here to save some gas as this is a hot
                // performance path.
                offset_ := sub(256, stepSize_)
                // bits 5+ determine the number of vals to be zipped. At least
                // one value must be provided so a `valLength_` of `0` is one
                // value to loop over.
                valLength_ := add(shr(5, operand_), 1)
            }
            state_.stackIndex -= valLength_;

            uint256[] memory baseVals_ = new uint256[](valLength_);
            for (uint256 a_ = 0; a_ < valLength_; a_++) {
                baseVals_[a_] = state_.stack[state_.stackIndex + a_];
            }

            for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
                for (uint256 a_ = 0; a_ < valLength_; a_++) {
                    state_.arguments[a_] =
                        (baseVals_[a_] << (offset_ - step_)) >>
                        offset_;
                }
                eval(context_, state_, sourceIndex_);
            }
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
        bytes memory context_,
        State memory state_,
        uint256 sourceIndex_
    ) internal view {
        // Everything in eval can be checked statically, there are no dynamic
        // runtime values read from the stack that can cause out of bounds
        // behaviour. E.g. sourceIndex in zipmap and size of a skip are both
        // taken from the operand in the source, not the stack. A program that
        // operates out of bounds SHOULD be flagged by static code analysis and
        // avoided by end-users.
        unchecked {
            uint256 i_ = 0;
            uint256 opcode_;
            uint256 operand_;
            uint256 len_;
            uint256 sourceLocation_;
            uint256 constantsLocation_;
            uint256 argumentsLocation_;
            uint256 stackLocation_;
            assembly {
                stackLocation_ := mload(add(state_, 0x20))
                sourceLocation_ := mload(
                    add(
                        mload(add(state_, 0x40)),
                        add(0x20, mul(sourceIndex_, 0x20))
                    )
                )
                constantsLocation_ := mload(add(state_, 0x60))
                argumentsLocation_ := mload(add(state_, 0x80))
                len_ := mload(sourceLocation_)
            }

            // Loop until complete.
            while (i_ < len_) {
                assembly {
                    i_ := add(i_, 2)
                    let op_ := mload(add(sourceLocation_, i_))
                    opcode_ := byte(30, op_)
                    operand_ := byte(31, op_)
                }
                if (opcode_ < OPS_LENGTH) {
                    if (opcode_ == OP_VAL) {
                        assembly {
                            let location_ := argumentsLocation_
                            if iszero(and(operand_, 0x80)) {
                                location_ := constantsLocation_
                            }

                            let stackIndex_ := mload(state_)
                            // Copy value to stack.
                            mstore(
                                add(
                                    stackLocation_,
                                    add(0x20, mul(stackIndex_, 0x20))
                                ),
                                mload(
                                    add(
                                        location_,
                                        add(
                                            0x20,
                                            mul(and(operand_, 0x7F), 0x20)
                                        )
                                    )
                                )
                            )
                            mstore(state_, add(stackIndex_, 1))
                        }
                    } else if (opcode_ == OP_ZIPMAP) {
                        zipmap(context_, state_, operand_);
                    } else {
                        // if the high bit of the operand is nonzero then take the
                        // top of the stack and if it is zero we do NOT skip.
                        // analogous to `JUMPI` in evm opcodes.
                        // If high bit of the operand is zero then we always skip.
                        // analogous to `JUMP` in evm opcodes.
                        // the operand is interpreted as a signed integer so that
                        // we can skip forwards or backwards. Notable difference
                        // between skip and jump from evm is that skip moves a
                        // relative distance from the current position and is known
                        // at compile time, while jump moves to an absolute
                        // position read from the stack at runtime. The relative
                        // simplicity of skip means we can check for out of bounds
                        // behaviour at compile time and each source can never goto
                        // a position in a different source.

                        // manually sign extend 1 bit.
                        // normal signextend works on bytes not bits.
                        int8 shift_ = int8(
                            uint8(operand_) & ((uint8(operand_) << 1) | 0x7F)
                        );
                        // if the high bit is 1...
                        if (operand_ & 0x80 > 0) {
                            // take the top of the stack and only skip if it is
                            // nonzero.
                            state_.stackIndex--;
                            if (state_.stack[state_.stackIndex] == 0) {
                                shift_ = 0;
                            }
                        }
                        if (shift_ != 0) {
                            if (shift_ < 0) {
                                i_ -= uint8(shift_ * -1) * 2;
                            } else {
                                i_ += uint8(shift_ * 2);
                            }
                        }
                    }
                } else {
                    applyOp(context_, state_, opcode_, operand_);
                }
            }
        }
    }

    /// Every contract that implements `RainVM` should override `applyOp` so
    /// that useful opcodes are available to script writers.
    /// For an example of a simple and efficient `applyOp` implementation that
    /// dispatches over several opcode packs see `CalculatorTest.sol`.
    /// Implementing contracts are encouraged to handle the dispatch with
    /// unchecked math as the dispatch is a critical performance path and
    /// default solidity checked math can significantly increase gas cost for
    /// each opcode dispatched. Consider that a single zipmap could loop over
    /// dozens of opcode dispatches internally.
    /// Stack is modified by reference NOT returned.
    /// @param context_ Bytes that the implementing contract can passthrough
    /// to be ready internally by its own opcodes. RainVM ignores the context.
    /// @param state_ The RainVM state that tracks the execution progress.
    /// @param opcode_ The current opcode to dispatch.
    /// @param operand_ Additional information to inform the opcode dispatch.
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view virtual {} //solhint-disable-line no-empty-blocks
}
