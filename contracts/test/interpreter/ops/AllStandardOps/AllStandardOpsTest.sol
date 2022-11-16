// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {StandardInterpreter} from "../../../../interpreter/run/StandardInterpreter.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../interpreter/deploy/RainInterpreterIntegrity.sol";

uint constant INTERPRETER_STATE_ID = 0;

/// @title AllStandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is StandardInterpreter {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256;

    uint256[] private _stack;
    uint256 private _stackIndex;

    constructor(
        address interpreterIntegrity_
    ) StandardInterpreter(interpreterIntegrity_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(
        StateConfig calldata stateConfig_,
        uint[] memory minStackOutputs_
    ) external {
        _saveInterpreterState(
            INTERPRETER_STATE_ID,
            stateConfig_,
            minStackOutputs_
        );
    }

    function stackTop() external view returns (uint256) {
        return _stack[_stackIndex - 1];
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        SourceIndex sourceIndex_ = SourceIndex.wrap(0);
        InterpreterState memory state_ = _loadInterpreterState(
            INTERPRETER_STATE_ID
        );
        uint256 a_ = gasleft();
        StackTop stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 b_ = gasleft();
        console.log("eval gas", a_ - b_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _stack = state_.stackBottom.down().asUint256Array();
        _stackIndex = state_.stackBottom.toIndex(stackTop_);
    }

    /// Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    function runContext(uint256[][] memory context_) public {
        SourceIndex sourceIndex_ = SourceIndex.wrap(0);
        InterpreterState memory state_ = _loadInterpreterState(
            INTERPRETER_STATE_ID
        );
        state_.context = context_;
        StackTop stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _stack = state_.stackBottom.down().asUint256Array();
        _stackIndex = state_.stackBottom.toIndex(stackTop_);
    }
}
