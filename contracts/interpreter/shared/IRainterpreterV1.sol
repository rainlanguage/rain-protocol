// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type ExpressionID is uint224;

/// @title IRainterpreterV1
/// @notice This interface exists to avoid baking certain assumptions about
/// expression security into the base `IInterpreterV1` interface.
interface IRainterpreterV1 {

    function isExpressionRegistered(ExpressionId id) external view returns (bool);

    function registerExpression(ExpressionID id, address expression) external;

}