// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "../RainVM.sol";

/// @title BlockOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library MathOps {

    /// Opcode for addition.
    uint constant public ADD = 0;
    /// Opcode for subtraction.
    uint constant public SUB = 1;
    /// Opcode for multiplication.
    uint constant public MUL = 2;
    /// Opcode for division.
    uint constant public DIV = 3;
    /// Opcode for modulo.
    uint constant public MOD = 4;
    /// Opcode for exponentiation.
    uint constant public EXP = 5;
    /// Opcode for minimum.
    uint constant public MIN = 6;
    /// Opcode for maximum.
    uint constant public MAX = 7;
    /// Number of provided opcodes for `MathOps`.
    uint constant public OPS_LENGTH = 8;

    function applyOp(
        bytes memory,
        State memory state_,
        uint opcode_,
        uint operand_
    )
    internal
    pure
    {
        require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
        uint accumulator_;
        uint cursor_;
        unchecked {
            state_.stackIndex -= operand_;
        }
        uint baseIndex_ = state_.stackIndex;
        unchecked {
            cursor_ = baseIndex_ + operand_ - 1;
            accumulator_ = state_.stack[cursor_];
        }

        // Addition.
        if (opcode_ == ADD) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ += state_.stack[cursor_];
            }
        }
        // Subtraction.
        else if (opcode_ == SUB) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ -= state_.stack[cursor_];
            }
        }
        // Multiplication.
        else if (opcode_ == MUL) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ *= state_.stack[cursor_];
            }
        }
        // Division.
        else if (opcode_ == DIV) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ /= state_.stack[cursor_];
            }
        }
        // Modulo.
        else if (opcode_ == MOD) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ %= state_.stack[cursor_];
            }
        }
        // Exponentiation.
        else if (opcode_ == EXP) {
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                accumulator_ ** state_.stack[cursor_];
            }
        }
        // Minimum.
        else if (opcode_ == MIN) {
            uint item_;
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                item_ = state_.stack[cursor_];
                if (item_ < accumulator_) { accumulator_ = item_; }
            }
        }
        // Maximum.
        else if (opcode_ == MAX) {
            uint item_;
            while (cursor_ > baseIndex_) {
                unchecked { cursor_--; }
                item_ = state_.stack[cursor_];
                if (item_ > accumulator_) { accumulator_ = item_; }
            }
        }

        unchecked {
            state_.stack[baseIndex_] = accumulator_;
            state_.stackIndex++;
        }
    }

}