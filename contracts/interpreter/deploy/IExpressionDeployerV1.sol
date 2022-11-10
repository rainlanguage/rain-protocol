// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

type EncodedConstraints is uint;

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
        EncodedConstraints[] memory constraints
    ) external returns (address expressionAddress, uint256 contextReads);
}
