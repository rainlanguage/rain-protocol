// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type SourceIndex is uint256;

interface IInterpreter {
    function eval(address expressionPointer, SourceIndex entrypoint, uint[][] memory context) external view returns (uint[] memory);
}