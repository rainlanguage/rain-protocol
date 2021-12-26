// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps, Ops as BlockOpsOps } from "../vm/ops/BlockOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";

contract CalculatorTest is RainVM, ImmutableSource {

    uint8 public immutable blockOpsStart;
    uint8 public immutable mathOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        blockOpsStart = uint8(RainVM.OPS_LENGTH);
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
            state_,
            0
        );
        return state_;
    }
}