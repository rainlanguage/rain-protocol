// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type SourceIndex is uint256;

interface IInterpreter {
    function eval(address statePointer_, SourceIndex entrypoint_, uint[][] memory context_) external view returns (uint[] memory);
}