// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../../math/SaturatingMath.sol";
import "../../type/LibCast.sol";
import "./LibStackTop.sol";
import "./LibInterpreterState.sol";
import "../../array/LibUint256Array.sol";
import "../../sstore2/SSTORE2.sol";
import "../deploy/IRainInterpreterIntegrity.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

type Operand is uint256;

/// @title RainInterpreter
/// @notice Interpreter for implementing and executing custom contract DSLs.
/// Libraries and contracts map opcodes to `view` functionality then
/// `RainInterpreter` runs Rain expressions using these opcodes. Rain expressions
/// dispatch as pairs of bytes. The first byte is an opcode to run and the
/// second byte is a value the opcode can use contextually to inform how to run.
/// Typically opcodes will read/write to the stack to produce some meaningful
/// final state after all opcodes have been dispatched.
///
/// The only thing required to run a Rain expression is a `State` struct to pass
/// to `eval`, and the index of the source to run. Additional context can
/// optionally be provided to be used by opcodes. For example, an `ITierV2`
/// contract can take the input of `report`, abi encode it as context, then
/// expose a local opcode that copies this account to the stack. The state will
/// be mutated by reference rather than returned by `eval`, this is to make it
/// very clear to implementers that the inline mutation is occurring.
///
/// Rain expressions run "top to bottom", i.e. "left to right".
/// See the tests for examples on how to construct Rain expression in JavaScript
/// then pass to `ImmutableSource` contracts deployed by a factory that then
/// run `eval` to produce a final value.
///
/// There are only 4 "core" opcodes for `RainInterpreter`:
/// - `0`: Copy value from either `constants` at index `operand` to the top of
///   the stack.
/// - `1`: Duplicates the value at stack index `operand_` to the top of the
///   stack.
/// - `2`: Zipmap takes N values from the stack, interprets each as an array of
///   configurable length, then zips them into `arguments` and maps a source
///   from `sources` over these. See `zipmap` for more details.
/// - `3`: Debug prints the state to the console log as per hardhat.
///
/// To do anything useful the contract that inherits `RainInterpreter` needs to provide
/// opcodes to build up an internal DSL. This may sound complex but it only
/// requires mapping opcode integers to functions to call, and reading/writing
/// values to the stack as input/output for these functions. Further, opcode
/// packs are provided in rain that any inheriting contract can use as a normal
/// solidity library. See `MathOps.sol` opcode pack and the
/// `CalculatorTest.sol` test contract for an example of how to dispatch
/// opcodes and handle the results in a wrapping contract.
///
/// RainInterpreter natively has no concept of branching logic such as `if` or loops.
/// An opcode pack could implement these similar to the core zipmap by lazily
/// evaluating a source from `sources` based on some condition, etc. Instead
/// some simpler, eagerly evaluated selection tools such as `min` and `max` in
/// the `MathOps` opcode pack are provided. Future versions of `RainInterpreter` MAY
/// implement lazy `if` and other similar patterns.
///
/// The `eval` function is `view` because Rain expressions are expected to
/// compute results only without modifying any state. The contract wrapping the
/// Interpreter is free to mutate as usual. This model encourages exposing only
/// read-only functionality to end-user deployers who provide expressions to an
/// interpreter factory. Removing all writes removes a lot of potential
/// foot-guns for expression authors and allows contract authors to reason more
/// clearly about the input/output of the wrapping solidity code.
///
/// Internally `RainInterpreter` makes heavy use of unchecked math and assembly
/// logic as the opcode dispatch logic runs on a tight loop and so gas costs can
/// ramp up very quickly.
abstract contract RainInterpreter {
    using Math for uint256;
    using SaturatingMath for uint256;
    using LibCast for uint256;
    using LibInterpreterState for InterpreterState;
    using LibStackTop for uint256[];
    using LibStackTop for bytes;
    using LibStackTop for StackTop;
    using LibCast for function(InterpreterState memory, SourceIndex, StackTop)
        internal
        view
        returns (StackTop);
    using LibCast for function(InterpreterState memory, Operand, StackTop)
        internal
        view
        returns (StackTop)[];
    using LibConvert for uint256[];
    using LibInterpreterState for StateConfig;

    /// Expose all the function pointers for every opcode as 2-byte pointers in
    /// a bytes list. The implementing Interpreter MUST ensure each pointer is
    /// to a `function(uint256,uint256) view returns (uint256)` function as this
    /// is the ONLY supported signature for opcodes. Pointers for the core
    /// opcodes must be provided in the packed pointers list but will be ignored
    /// at runtime.
    function opcodeFunctionPointers()
        internal
        view
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                internal
                view
                returns (StackTop)[]
                memory
        );

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function buildStateBytes(
        IRainInterpreterIntegrity interpreterIntegrity_,
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) internal view returns (bytes memory) {
        unchecked {
            (
                ,
                uint256 stackLength_
            ) = interpreterIntegrity_.ensureIntegrity(
                    config_.sources,
                    config_.constants.length,
                    minStackOutputs_
                );

            return
                config_.serialize(
                    stackLength_,
                    opcodeFunctionPointers()
                        .asUint256Array()
                        .unsafeTo16BitBytes()
                );
        }
    }
}
