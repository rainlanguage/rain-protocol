// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "hardhat/console.sol";

import { RainCompiler, Stack, Op } from "../compiler/RainCompiler.sol";

contract CalculatorTest is RainCompiler {
    uint8 public constant OPCODE_ADD = 1 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_SUB = 2 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_MUL = 3 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_DIV = 4 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_MOD = 5 + OPCODE_RESERVED_MAX;

    constructor(bytes memory source_, uint256[] memory args_)
        public
        // solhint-disable-next-line no-empty-blocks
        RainCompiler(source_, args_) { }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override
        view
        returns (Stack memory)
    {
        if (op_.code == OPCODE_ADD) {
            stack_.index -= op_.val;
            uint256 accumulator_ = 0;
            for (uint256 a_ = 0; a_ < op_.val; a_++) {
                // Addition is commutative so it doesn't matter that we're
                // technically iterating the inputs backwards here.
                accumulator_ = accumulator_
                    .add(stack_.vals[stack_.index + a_]);
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == OPCODE_SUB) {
            stack_.index++;
        } else if (op_.code == OPCODE_MUL) {
            stack_.index++;
        } else if (op_.code == OPCODE_DIV) {
            stack_.index++;
        } else if (op_.code == OPCODE_MOD) {
            stack_.index++;
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
            stack_,
            compiledSource()
        );

        return stack_.vals[stack_.index - 1];
    }
}