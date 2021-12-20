// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, Ops as RainVMOps, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps, Ops as BlockOpsOps } from "../vm/ops/BlockOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";

contract CalculatorTest is RainVM, ImmutableSource {

    uint8 public immutable blockOpsStart;
    uint8 public immutable mathOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        blockOpsStart = uint8(RainVMOps.length);
        mathOpsStart = blockOpsStart + uint8(BlockOpsOps.length);
    }

    function applyOp(
        bytes memory context_,
        State memory state_,
        Op memory op_
    )
        internal
        override
        view
    {
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

    function run()
        external
        view
        virtual
        returns (uint256)
    {
        State memory state_ = runState();
        return state_.stack[state_.stackIndex - 1];
    }

    function runState()
        public
        view
        virtual
        returns (State memory)
    {
        State memory state_ = newState();
        eval(
            "",
            source(),
            state_
        );
        return state_;
    }
}