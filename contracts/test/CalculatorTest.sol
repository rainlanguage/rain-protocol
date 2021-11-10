// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import { RainCompiler, Source, Stack, Op } from "../compiler/RainCompiler.sol";
import "hardhat/console.sol";

contract CalculatorTest is RainCompiler {
    uint8 public constant OPCODE_ADD = 1 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_SUB = 2 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_MUL = 3 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_DIV = 4 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_MOD = 5 + OPCODE_RESERVED_MAX;

    constructor(Source memory source_)
        public
        // solhint-disable-next-line no-empty-blocks
        RainCompiler(source_) { }

    function applyOp(
        bytes memory,
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
            stack_.index -= op_.val;
            // Set initial value as first number.
            uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];
            for (uint256 a_ = 0; a_ < op_.val - 1; a_++) {
                // Iterate backwards through inputs, subtracting each one from
                // the current value, being careful not to subtract the first
                // number from itself.
                accumulator_ = accumulator_
                    .sub(stack_.vals[stack_.index + a_]);
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == OPCODE_MUL) {
            stack_.index -= op_.val;
            // Set initial value as first number.
            uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];
            for (uint256 a_ = 0; a_ < op_.val - 1; a_++) {
                // Iterate backwards through inputs, multiplying the current
                // value by each one, being careful not to multiply the first
                // number again.
                accumulator_ = accumulator_
                    .mul(stack_.vals[stack_.index + a_]);
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == OPCODE_DIV) {
            stack_.index -= op_.val;
            // Set numerator value as first number.
            uint256 numerator_ = stack_.vals[stack_.index + op_.val - 1];
            // Set initial denominator value as second number.
            uint256 denominator_ = stack_.vals[stack_.index + op_.val - 2];
            for (uint256 a_ = 0; a_ < op_.val - 2; a_++) {
                // Iterate backwards through inputs, calculating the total
                // denominator, being careful not to multiply by the initial
                // denominator value again.
                denominator_ = denominator_
                    .mul(stack_.vals[stack_.index + a_]);
            }
            stack_.vals[stack_.index] = numerator_.div(denominator_);
            stack_.index++;
        } else if (op_.code == OPCODE_MOD) {
            stack_.index -= op_.val;
            // Set numerator value as first number.
            uint256 numerator_ = stack_.vals[stack_.index + op_.val - 1];
            // Set initial denominator value as second number.
            uint256 denominator_ = stack_.vals[stack_.index + op_.val - 2];
            for (uint256 a_ = 0; a_ < op_.val - 2; a_++) {
                // Iterate backwards through inputs, calculating the total
                // denominator, being careful not to multiply by the initial
                // denominator value again.
                denominator_ = denominator_
                    .mul(stack_.vals[stack_.index + a_]);
            }
            stack_.vals[stack_.index] = numerator_.mod(denominator_);
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