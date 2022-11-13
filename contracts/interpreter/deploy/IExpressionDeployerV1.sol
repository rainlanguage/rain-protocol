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
    function deployExpression(
        StateConfig memory config,
        uint[] memory minOutputs
    ) external returns (address expressionAddress, uint256 contextReads);
}
