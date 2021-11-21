// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import "../vm/ops/BlockOps.sol";
import "../vm/ops/MathOps.sol";

contract CalculatorTest is RainVM, ImmutableSource, BlockOps, MathOps {

    constructor(Source memory source_)
        ImmutableSource(source_)
        BlockOps(OPCODE_RESERVED_MAX)
        MathOps(blockOpsStart + BLOCK_OPS_LENGTH)
    { } // solhint-disable-line no-empty-blocks

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override(RainVM, BlockOps, MathOps)
        view
        returns (Stack memory)
    {
        if (op_.code < blockOpsStart + BLOCK_OPS_LENGTH) {
            return BlockOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < mathOpsStart + MATH_OPS_LENGTH) {
            return MathOps.applyOp(
                context_,
                stack_,
                op_
            );
        }

        return stack_;
    }

    function run()
        external
        view
        virtual
        returns (uint256)
    {
        Stack memory stack_;
        bytes memory context_ = new bytes(0);
        stack_ = eval(
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
        stack_ = eval(
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
        stack_ = eval(
            context_,
            source_,
            stack_
        );

        return stack_;
    }
}