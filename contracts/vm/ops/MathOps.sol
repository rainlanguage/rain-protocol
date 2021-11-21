// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../RainVM.sol";

abstract contract MathOps {
    uint8 public immutable mathOpsStart;
    uint8 public immutable opcodeAdd;
    uint8 public immutable opcodeSub;
    uint8 public immutable opcodeMul;
    uint8 public immutable opcodeDiv;
    uint8 public immutable opcodeMod;
    uint8 public immutable opcodePow;
    uint8 public constant MATH_OPS_LENGTH = 6;

    constructor(uint8 start_) {
        mathOpsStart = start_;
        opcodeAdd = start_;
        opcodeSub = start_ + 1;
        opcodeMul = start_ + 2;
        opcodeDiv = start_ + 3;
        opcodeMod = start_ + 4;
        opcodePow = start_ + 5;
    }

    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    returns (Stack memory) {
        if (op_.code == opcodeAdd) {
            stack_.index -= op_.val;
            uint256 accumulator_ = 0;
            for (uint256 a_ = 0; a_ < op_.val; a_++) {
                // Addition is commutative so it doesn't matter that we're
                // technically iterating the inputs backwards here.
                accumulator_ = accumulator_ + stack_.vals[stack_.index + a_];
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == opcodeSub) {
            stack_.index -= op_.val;
            // Set initial value as first number.
            uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];
            for (uint256 a_ = 0; a_ < op_.val - 1; a_++) {
                // Iterate backwards through inputs, subtracting each one from
                // the current value, being careful not to subtract the first
                // number from itself.
                accumulator_ = accumulator_ - stack_.vals[stack_.index + a_];
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == opcodeMul) {
            stack_.index -= op_.val;
            // Set initial value as first number.
            uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];
            for (uint256 a_ = 0; a_ < op_.val - 1; a_++) {
                // Iterate backwards through inputs, multiplying the current
                // value by each one, being careful not to multiply the first
                // number again.
                accumulator_ = accumulator_ * stack_.vals[stack_.index + a_];
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        } else if (op_.code == opcodeDiv) {
            stack_.index -= op_.val;
            // Set numerator value as first number.
            uint256 numerator_ = stack_.vals[stack_.index + op_.val - 1];
            // Set initial denominator value as second number.
            uint256 denominator_ = stack_.vals[stack_.index + op_.val - 2];
            for (uint256 a_ = 0; a_ < op_.val - 2; a_++) {
                // Iterate backwards through inputs, calculating the total
                // denominator, being careful not to multiply by the initial
                // denominator value again.
                denominator_ = denominator_ * stack_.vals[stack_.index + a_];
            }
            stack_.vals[stack_.index] = numerator_ / denominator_;
            stack_.index++;
        } else if (op_.code == opcodeMod) {
            stack_.index -= op_.val;
            // Set numerator value as first number.
            uint256 numerator_ = stack_.vals[stack_.index + op_.val - 1];
            // Set initial denominator value as second number.
            uint256 denominator_ = stack_.vals[stack_.index + op_.val - 2];
            for (uint256 a_ = 0; a_ < op_.val - 2; a_++) {
                // Iterate backwards through inputs, calculating the total
                // denominator, being careful not to multiply by the initial
                // denominator value again.
                denominator_ = denominator_ * stack_.vals[stack_.index + a_];
            }
            stack_.vals[stack_.index] = numerator_ % denominator_;
            stack_.index++;
        }
        return stack_;
    }

}