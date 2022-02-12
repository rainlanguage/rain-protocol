// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";
import "../../math/FixedPointMath.sol";

/// @title FixedPointMathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library MathOps {
    using FixedPointMath for uint256;

    /// Opcode for multiplication.
    uint256 private constant MUL = 0;
    /// Opcode for division.
    uint256 private constant DIV = 1;
    /// Opcode to rescale some fixed point number in situ.
    uint256 private constant SCALE = 2;
    /// Opcode for stacking number of fixed point decimals used.
    uint256 private constant DECIMALS = 3;
    /// Opcode for stacking the definition of one.
    uint256 private constant ONE = 4;
    /// Number of provided opcodes for `FixedPointMathOps`.
    uint256 internal constant OPS_LENGTH = 5;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            if (opcode_ < SCALE) {
                uint256 baseIndex_ = state_.stackIndex - operand_;
                uint256 top_ = state_.stackIndex - 1;
                uint256 cursor_ = baseIndex_;
                uint256 accumulator_ = state_.stack[cursor_];

                if (opcode_ == MUL) {
                    while (cursor_ < top_) {
                        cursor_++;
                        accumulator_ = accumulator_.fixedPointMul(
                            state_.stack[cursor_]
                        );
                    }
                } else if (opcode_ == DIV) {
                    while (cursor_ < top_) {
                        cursor_++;
                        accumulator_ = accumulator_.fixedPointDiv(
                            state_.stack[cursor_]
                        );
                    }
                }
                state_.stack[baseIndex_] = accumulator_;
                state_.stackIndex = baseIndex_ + 1;
            } else {
                if (opcode_ == SCALE) {
                    uint256 baseIndex_ = state_.stackIndex - 1;
                    state_.stack[baseIndex_] = state_.stack[baseIndex_].scale(
                        operand_
                    );
                } else if (opcode_ == DECIMALS) {
                    state_.stack[state_.stackIndex] = FixedPointMath.DECIMALS;
                    state_.stackIndex++;
                } else if (opcode_ == ONE) {
                    state_.stack[state_.stackIndex] = FixedPointMath.ONE;
                    state_.stackIndex++;
                }
            }
        }
    }
}
