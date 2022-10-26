// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type SourceIndex is uint256;

interface IInterpreter {
    function eval(
        address expressionPointer,
        SourceIndex entrypoint,
        uint256[][] memory context
    ) external view returns (uint256[] memory);
}
