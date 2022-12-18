// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

interface IExpressionDeployerV1 {
    /// Deploy an expression to be eval'able by the bound interpreter.
    /// MUST revert if no interpreter has been bound.
    function deployExpression(
        StateConfig memory config,
        uint[] memory minOutputs
    ) external returns (address expressionAddress, uint256 contextReads);

    /// Binds this expression deployer to a specific interpreter.
    /// MUST be called by the interpreter itself so that the
    /// `IExpressionDeployerV1` can inspect the bytecode of the sender directly
    /// and reject bindings to unknown expression runtime environments.
    function bindInterpreter() external;
}
