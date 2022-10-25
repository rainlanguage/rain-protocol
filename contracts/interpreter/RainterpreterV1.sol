// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./runtime/StandardInterpreter.sol";

contract RainterpreterV1 is IInterpreter, StandardInterpreter {
    using LibInterpreter for InterpreterState;
    using LibStackTop for StackTop;

    constructor(address interpreterIntegrity_)
        StandardInterpreter(interpreterIntegrity_)
    {}

    function eval(
        address statePointer_,
        SourceIndex entrypoint_,
        uint256[][] memory context_
    ) external view returns (uint256[] memory) {
        InterpreterState memory state_ = _loadInterpreterState(
            statePointer_,
            context_
        );
        StackTop stackTop_ = state_.eval(entrypoint_);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(stackLength_);
        return tail_;
    }
}
