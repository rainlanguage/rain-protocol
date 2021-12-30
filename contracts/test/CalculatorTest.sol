// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { RainVM, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";

/// @title CalculatorTest
/// Simple calculator that exposes basic math ops and block ops for testing.
contract CalculatorTest is RainVM, ImmutableSource {

    uint public immutable blockOpsStart;
    uint public immutable mathOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        blockOpsStart = RainVM.OPS_LENGTH;
        mathOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        Op memory op_
    )
        internal
        override
        view
    {
        unchecked {
            if (op_.code < mathOpsStart) {
                op_.code -= blockOpsStart;
                BlockOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
            else {
                op_.code -= mathOpsStart;
                MathOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
        }
    }

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function run()
        external
        view
        returns (uint)
    {
        State memory state_ = runState();
        return state_.stack[state_.stackIndex - 1];
    }

    /// Runs `eval` and returns full state.
    /// @return `State` after running own immutable source.
    function runState()
        public
        view
        returns (State memory)
    {
        State memory state_ = newState();
        eval(
            "",
            state_,
            0
        );
        return state_;
    }
}