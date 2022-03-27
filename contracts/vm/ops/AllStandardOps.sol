// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State, RainVM, RAIN_VM_OPS_LENGTH} from "../RainVM.sol";
import {EVMConstantOps, EVM_CONSTANT_OPS_LENGTH} from "./EVMConstantOps.sol";
import {FixedPointMathOps, FIXED_POINT_MATH_OPS_LENGTH} from "./FixedPointMathOps.sol";
import {IERC20Ops, IERC20_OPS_LENGTH} from "./IERC20Ops.sol";
import {IERC721Ops, IERC721_OPS_LENGTH} from "./IERC721Ops.sol";
import {IERC1155Ops, IERC1155_OPS_LENGTH} from "./IERC1155Ops.sol";
import {LogicOps, LOGIC_OPS_LENGTH} from "./LogicOps.sol";
import {MathOps, MATH_OPS_LENGTH} from "./MathOps.sol";
import {TierOps, TIER_OPS_LENGTH} from "./TierOps.sol";

uint256 constant ALL_STANDARD_OPS_START = RAIN_VM_OPS_LENGTH;
uint256 constant FIXED_POINT_MATH_OPS_START = EVM_CONSTANT_OPS_LENGTH;
uint256 constant IERC20_OPS_START = FIXED_POINT_MATH_OPS_START +
    FIXED_POINT_MATH_OPS_LENGTH;
uint256 constant IERC721_OPS_START = IERC20_OPS_START + IERC20_OPS_LENGTH;
uint256 constant IERC1155_OPS_START = IERC721_OPS_START + IERC721_OPS_LENGTH;
uint256 constant LOGIC_OPS_START = IERC1155_OPS_START + IERC1155_OPS_LENGTH;
uint256 constant MATH_OPS_START = LOGIC_OPS_START + LOGIC_OPS_LENGTH;
uint256 constant TIER_OPS_START = MATH_OPS_START + MATH_OPS_LENGTH;
uint256 constant ALL_STANDARD_OPS_LENGTH = TIER_OPS_START + TIER_OPS_LENGTH;

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
                EVMConstantOps.applyOp(state_, opcode_, operand_);
            } else if (opcode_ < IERC20_OPS_START) {
                FixedPointMathOps.applyOp(
                    state_,
                    opcode_ - FIXED_POINT_MATH_OPS_START,
                    operand_
                );
            } else if (opcode_ < IERC721_OPS_START) {
                IERC20Ops.applyOp(state_, opcode_ - IERC20_OPS_START, operand_);
            } else if (opcode_ < IERC1155_OPS_START) {
                IERC721Ops.applyOp(
                    state_,
                    opcode_ - IERC721_OPS_START,
                    operand_
                );
            } else if (opcode_ < LOGIC_OPS_START) {
                IERC1155Ops.applyOp(
                    state_,
                    opcode_ - IERC1155_OPS_START,
                    operand_
                );
            } else if (opcode_ < MATH_OPS_START) {
                LogicOps.applyOp(state_, opcode_ - LOGIC_OPS_START, operand_);
            } else if (opcode_ < TIER_OPS_START) {
                MathOps.applyOp(state_, opcode_ - MATH_OPS_START, operand_);
            } else {
                TierOps.applyOp(state_, opcode_ - TIER_OPS_START, operand_);
            }
        }
    }
}
