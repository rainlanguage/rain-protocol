// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";
import "../../math/FixedPointMath.sol";

/// @title FixedPointMathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library FixedPointMathOps {
    using FixedPointMath for uint256;

    /// Opcode for multiplication.
    uint256 private constant SCALE18_MUL = 0;
    /// Opcode for division.
    uint256 private constant SCALE18_DIV = 1;
    /// Opcode to rescale some fixed point number to 18 OOMs in situ.
    uint256 private constant SCALE18 = 2;
    /// Opcode to rescale an 18 OOMs fixed point number to scale N.
    uint256 private constant SCALEN = 3;
    /// Opcode to rescale an arbitrary fixed point number by some OOMs.
    uint256 private constant SCALE_BY = 4;
    /// Opcode for stacking the definition of one.
    uint256 private constant ONE = 5;
    /// Opcode for stacking number of fixed point decimals used.
    uint256 private constant DECIMALS = 6;
    /// Number of provided opcodes for `FixedPointMathOps`.
    uint256 internal constant OPS_LENGTH = 7;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            if (opcode_ < SCALE18) {
                uint256 baseIndex_ = state_.stackIndex - 2;
                if (opcode_ == SCALE18_MUL) {
                    state_.stack[baseIndex_] = state_
                        .stack[baseIndex_]
                        .scale18(operand_)
                        * state_.stack[baseIndex_ + 1];
                } else if (opcode_ == SCALE18_DIV) {
                    state_.stack[baseIndex_] = state_
                        .stack[baseIndex_]
                        .scale18(operand_)
                        / state_.stack[baseIndex_ + 1];
                }
                state_.stackIndex--;
            } else if (opcode_ < ONE) {
                uint256 baseIndex_ = state_.stackIndex - 1;
                if (opcode_ == SCALE18) {
                    state_.stack[baseIndex_] = state_.stack[baseIndex_].scale18(
                        operand_
                    );
                } else if (opcode_ == SCALEN) {
                    state_.stack[baseIndex_] = state_.stack[baseIndex_].scaleN(
                        operand_
                    );
                } else if (opcode_ == SCALE_BY) {
                    state_.stack[baseIndex_] = state_.stack[baseIndex_].scaleBy(
                        int256(operand_)
                    );
                }
            } else {
                if (opcode_ == ONE) {
                    state_.stack[state_.stackIndex] = FixedPointMath.ONE;
                    state_.stackIndex++;
                } else if (opcode_ == DECIMALS) {
                    state_.stack[state_.stackIndex] = FixedPointMath.DECIMALS;
                    state_.stackIndex++;
                }
            }
        }
    }
}
