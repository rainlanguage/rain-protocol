// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @dev Opcode for addition.
uint256 constant OPCODE_ADD = 0;
/// @dev Opcode for subtraction.
uint256 constant OPCODE_SUB = 1;
/// @dev Opcode for multiplication.
uint256 constant OPCODE_MUL = 2;
/// @dev Opcode for division.
uint256 constant OPCODE_DIV = 3;
/// @dev Opcode for modulo.
uint256 constant OPCODE_MOD = 4;
/// @dev Opcode for exponentiation.
uint256 constant OPCODE_EXP = 5;
/// @dev Opcode for minimum.
uint256 constant OPCODE_MIN = 6;
/// @dev Opcode for maximum.
uint256 constant OPCODE_MAX = 7;
/// @dev Number of provided opcodes for `MathOps`.
uint256 constant MATH_OPS_LENGTH = 8;

/// @title MathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library MathOps {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure {
        require(opcode_ < MATH_OPS_LENGTH, "MAX_OPCODE");
        uint256 baseIndex_;
        uint256 top_;
        unchecked {
            baseIndex_ = state_.stackIndex - operand_;
            top_ = state_.stackIndex - 1;
        }
        uint256 cursor_ = baseIndex_;
        uint256 accumulator_ = state_.stack[cursor_];

        // Addition.
        if (opcode_ == OPCODE_ADD) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ += state_.stack[cursor_];
            }
        }
        // Subtraction.
        else if (opcode_ == OPCODE_SUB) {
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
        else if (opcode_ == OPCODE_MUL) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ *= state_.stack[cursor_];
            }
        }
        // Division.
        else if (opcode_ == OPCODE_DIV) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ /= state_.stack[cursor_];
            }
        }
        // Modulo.
        else if (opcode_ == OPCODE_MOD) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ %= state_.stack[cursor_];
            }
        }
        // Exponentiation.
        else if (opcode_ == OPCODE_EXP) {
            while (cursor_ < top_) {
                unchecked {
                    cursor_++;
                }
                accumulator_ = accumulator_**state_.stack[cursor_];
            }
        }
        // Minimum.
        else if (opcode_ == OPCODE_MIN) {
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
        else if (opcode_ == OPCODE_MAX) {
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
            state_.stackIndex = baseIndex_ + 1;
        }
    }
}
