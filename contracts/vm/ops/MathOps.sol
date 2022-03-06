// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @title BlockOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library MathOps {
    /// Opcode for addition.
    uint256 private constant ADD = 0;
    /// Opcode for subtraction.
    uint256 private constant SUB = 1;
    /// Opcode for multiplication.
    uint256 private constant MUL = 2;
    /// Opcode for division.
    uint256 private constant DIV = 3;
    /// Opcode for modulo.
    uint256 private constant MOD = 4;
    /// Opcode for exponentiation.
    uint256 private constant EXP = 5;
    /// Opcode for minimum.
    uint256 private constant MIN = 6;
    /// Opcode for maximum.
    uint256 private constant MAX = 7;
    /// Number of provided opcodes for `MathOps`.
    uint256 internal constant OPS_LENGTH = 8;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure {
        require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
        uint256 top_;
        unchecked {
            top_ = state_.stackIndex - 1;
            state_.stackIndex -= operand_;
        }
        uint256 baseIndex_ = state_.stackIndex;
        uint256 cursor_ = baseIndex_;
        uint256 accumulator_ = state_.stack[cursor_];

        // Addition.
        if (opcode_ == ADD) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ += state_.stack[cursor_];
            }
        }
        // Subtraction.
        else if (opcode_ == SUB) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ -= state_.stack[cursor_];
            }
        }
        // Multiplication.
        // Slither false positive here complaining about dividing before
        // multiplying but both are mututally exclusive according to `opcode_`.
        else if (opcode_ == MUL) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ *= state_.stack[cursor_];
            }
        }
        // Division.
        else if (opcode_ == DIV) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ /= state_.stack[cursor_];
            }
        }
        // Modulo.
        else if (opcode_ == MOD) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ %= state_.stack[cursor_];
            }
        }
        // Exponentiation.
        else if (opcode_ == EXP) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ = accumulator_**state_.stack[cursor_];
            }
        }
        // Minimum.
        else if (opcode_ == MIN) {
            uint256 item_;
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                item_ = state_.stack[cursor_];
                if (item_ < accumulator_) {
                    accumulator_ = item_;
                }
            }
        }
        // Maximum.
        else if (opcode_ == MAX) {
            uint256 item_;
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                item_ = state_.stack[cursor_];
                if (item_ > accumulator_) {
                    accumulator_ = item_;
                }
            }
        }

        unchecked {
            state_.stack[baseIndex_] = accumulator_;
            state_.stackIndex++;
        }
    }
}
