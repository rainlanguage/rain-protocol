// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State, RainVM, RAIN_VM_OPS_LENGTH} from "../RainVM.sol";
import {BlockOps, BLOCK_OPS_LENGTH} from "./BlockOps.sol";
import {FIXED_POINT_MATH_OPS_LENGTH} from "./FixedPointMathOps.sol";

uint256 constant ALL_STANDARD_OPS_START = RAIN_VM_OPS_LENGTH;
uint256 constant BLOCK_OPS_START = ALL_STANDARD_OPS_START;
uint256 constant FIXED_POINT_MATH_OPS_START = BLOCK_OPS_START +
    BLOCK_OPS_LENGTH;
uint256 constant ALL_STANDARD_OPS_LENGTH = FIXED_POINT_MATH_OPS_START +
    FIXED_POINT_MATH_OPS_LENGTH;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view {
        unchecked {
            if (opcode_ < FIXED_POINT_MATH_OPS_START) {
                BlockOps.applyOp(state_, opcode_ - BLOCK_OPS_START, operand_);
            }
        }
    }
}
