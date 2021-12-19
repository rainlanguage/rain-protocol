// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, Ops as RainVMOps, Stack, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps, Ops as BlockOpsOps } from "../vm/ops/BlockOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";

contract CalculatorTest is RainVM, ImmutableSource {

    uint8 public immutable blockOpsStart;
    uint8 public immutable mathOpsStart;

    constructor(Source memory source_)
        ImmutableSource(source_)
    {
        blockOpsStart = uint8(RainVMOps.length);
        mathOpsStart = blockOpsStart + uint8(BlockOpsOps.length);
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
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
                stack_,
                op_
            );
        }
        else {
            op_.code -= mathOpsStart;
            MathOps.applyOp(
                context_,
                stack_,
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
        Stack memory stack_;
        bytes memory context_ = new bytes(0);
        eval(
            context_,
            source(),
            stack_
        );

        return stack_.vals[stack_.index - 1];
    }

    function eval(Source memory source_)
        external
        view
        virtual
        returns (uint256)
    {
        Stack memory stack_;
        bytes memory context_ = new bytes(0);
        eval(
            context_,
            source_,
            stack_
        );

        return stack_.vals[stack_.index - 1];
    }

    function evalStack(Source memory source_)
        external
        view
        virtual
        returns (Stack memory)
    {
        Stack memory stack_;
        bytes memory context_ = new bytes(0);
        eval(
            context_,
            source_,
            stack_
        );

        return stack_;
    }
}