// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

/// Config required to build a new `State`.
/// @param sources Sources verbatim. These sources MUST be provided in their
/// sequential/index opcode form as the deployment process will need to index
/// into BOTH the integrity check and the final runtime function pointers.
/// This will be emitted in an event for offchain processing to use the indexed
/// opcode sources.
/// @param constants Constants verbatim. Constants are provided alongside sources
/// rather than inline as it allows us to avoid variable length opcodes and can
/// be more memory efficient if the same constant is referenced several times
/// from the sources.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

/// @title IExpressionDeployerV1
/// @notice Expressions are expected to be deployed onchain as immutable contract
/// code with a first class address like any other contract or account.
/// Technically this is optional in the sense that all the tools required to
/// eval some expression and define all its opcodes are available as libraries.
///
/// In practise there are enough advantages to deploying the sources directly
/// onchain as contract data and loading them from the interpreter at eval time:
///
/// - Loading and storing binary data is gas efficient as immutable contract data
/// - Expressions need to be immutable between their deploy time integrity check
///   and runtime evaluation
/// - Passing the address of an expression through calldata to an interpreter is
///   cheaper than passing an entire expression through calldata
/// - Conceptually a very simple approach, even if implementations like SSTORE2
///   are subtle under the hood
///
/// The expression deployer MUST perform an integrity check of the source code
/// before it puts the expression onchain at a known address. The integrity check
/// MUST at a minimum (it is free to do additional static analysis) calculate the
/// memory required to be allocated for the stack in total, and that no out of
/// bounds memory reads/writes occur within this stack. A simple example of an
/// invalid source would be one that pushes one value to the stack then attempts
/// to pops two values, clearly we cannot remove more values than we added.
///
/// Once the integrity check is complete the deployer MUST do any additional
/// processing required by its paired interpreter. For example, the expression
/// deployer MAY NEED to replace the indexed opcodes in the `StateConfig` sources
/// with real function pointers from the corresponding interpreter.
///
/// Interpreters MUST assume that expression deployers are malicious and fail
/// gracefully if the integrity check is corrupt/bypassed and/or function
/// pointers are incorrect, etc. i.e. the interpreter MUST always return a stack
/// from `eval` in a read only way or error. I.e. it is the expression deployer's
/// responsibility to do everything it can to prevent undefined behaviour in the
/// interpreter, and the interpreter's responsibility to handle the expression
/// deployer completely failing to do so.
interface IExpressionDeployerV1 {
    function deployExpression(
        StateConfig memory config,
        uint[] memory minOutputs
    ) external returns (address expressionAddress);
}
