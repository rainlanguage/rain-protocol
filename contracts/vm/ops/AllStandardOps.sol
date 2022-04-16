// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State, RainVM, DispatchTable, Dispatch, RAIN_VM_OPS_LENGTH} from "../RainVM.sol";
import "./evm/EVMConstantOps.sol";
import "./math/FixedPointMathOps.sol";
import "./token/IERC20Ops.sol";
import "./token/IERC721Ops.sol";
import "./token/IERC1155Ops.sol";
import "./math/LogicOps.sol";
import "./math/MathOps.sol";
import "./tier/TierOps.sol";

uint256 constant ALL_STANDARD_OPS_START = RAIN_VM_OPS_LENGTH;

uint256 constant FP_MATH_OPS_START = ALL_STANDARD_OPS_START +
    EVM_CONSTANT_OPS_LENGTH;
uint256 constant FP_MATH_OPCODE_SCALE18_MUL = FP_MATH_OPS_START +
    OPCODE_SCALE18_MUL;
uint256 constant FP_MATH_OPCODE_SCALE18_DIV = FP_MATH_OPS_START +
    OPCODE_SCALE18_DIV;
uint256 constant FP_MATH_OPCODE_SCALE18 = FP_MATH_OPS_START + OPCODE_SCALE18;
uint256 constant FP_MATH_OPCODE_SCALEN = FP_MATH_OPS_START + OPCODE_SCALEN;
uint256 constant FP_MATH_OPCODE_SCALE_BY = FP_MATH_OPS_START + OPCODE_SCALE_BY;

uint256 constant MATH_OPS_START = FP_MATH_OPS_START +
    FIXED_POINT_MATH_OPS_LENGTH;
uint256 constant MATH_OPCODE_ADD = MATH_OPS_START + OPCODE_ADD;
uint256 constant MATH_OPCODE_SATURATING_ADD = MATH_OPS_START +
    OPCODE_SATURATING_ADD;
uint256 constant MATH_OPCODE_SUB = MATH_OPS_START + OPCODE_SUB;
uint256 constant MATH_OPCODE_SATURATING_SUB = MATH_OPS_START +
    OPCODE_SATURATING_SUB;
uint256 constant MATH_OPCODE_MUL = MATH_OPS_START + OPCODE_MUL;
uint256 constant MATH_OPCODE_SATURATING_MUL = MATH_OPS_START +
    OPCODE_SATURATING_MUL;
uint256 constant MATH_OPCODE_DIV = MATH_OPS_START + OPCODE_DIV;
uint256 constant MATH_OPCODE_MOD = MATH_OPS_START + OPCODE_MOD;
uint256 constant MATH_OPCODE_EXP = MATH_OPS_START + OPCODE_EXP;
uint256 constant MATH_OPCODE_MIN = MATH_OPS_START + OPCODE_MIN;
uint256 constant MATH_OPCODE_MAX = MATH_OPS_START + OPCODE_MAX;

uint256 constant LOGIC_OPS_START = MATH_OPS_START + MATH_OPS_LENGTH;
uint256 constant LOGIC_OPCODE_ISZERO = LOGIC_OPS_START + OPCODE_ISZERO;
uint256 constant LOGIC_OPCODE_EAGER_IF = LOGIC_OPS_START + OPCODE_EAGER_IF;
uint256 constant LOGIC_OPCODE_EQUAL_TO = LOGIC_OPS_START + OPCODE_EQUAL_TO;
uint256 constant LOGIC_OPCODE_LESS_THAN = LOGIC_OPS_START + OPCODE_LESS_THAN;
uint256 constant LOGIC_OPCODE_GREATER_THAN = LOGIC_OPS_START +
    OPCODE_GREATER_THAN;
uint256 constant LOGIC_OPCODE_EVERY = LOGIC_OPS_START + OPCODE_EVERY;
uint256 constant LOGIC_OPCODE_ANY = LOGIC_OPS_START + OPCODE_ANY;

uint256 constant TIER_OPS_START = LOGIC_OPS_START + LOGIC_OPS_LENGTH;
uint256 constant TIER_OPCODE_REPORT = TIER_OPS_START + OPCODE_REPORT;
uint256 constant TIER_OPCODE_SATURATING_DIFF = TIER_OPS_START +
    OPCODE_SATURATING_DIFF;
uint256 constant TIER_OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE = TIER_OPS_START +
    OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE;
uint256 constant TIER_OPCODE_SELECT_LTE = TIER_OPS_START + OPCODE_SELECT_LTE;

uint256 constant IERC20_OPS_START = TIER_OPS_START + TIER_OPS_LENGTH;
uint256 constant IERC20_OPCODE_IERC20_BALANCE_OF = IERC20_OPS_START +
    OPCODE_IERC20_BALANCE_OF;
uint256 constant IERC20_OPCODE_IERC20_TOTAL_SUPPLY = IERC20_OPS_START +
    OPCODE_IERC20_TOTAL_SUPPLY;

uint256 constant IERC721_OPS_START = IERC20_OPS_START + IERC20_OPS_LENGTH;
uint256 constant IERC721_OPCODE_IERC721_BALANCE_OF = IERC721_OPS_START +
    OPCODE_IERC721_BALANCE_OF;
uint256 constant IERC721_OPCODE_IERC721_OWNER_OF = IERC721_OPS_START +
    OPCODE_IERC721_OWNER_OF;

uint256 constant IERC1155_OPS_START = IERC721_OPS_START + IERC721_OPS_LENGTH;
uint256 constant IERC1155_OPCODE_IERC1155_BALANCE_OF = IERC1155_OPS_START +
    OPCODE_IERC1155_BALANCE_OF;
uint256 constant IERC1155_OPCODE_IERC1155_BALANCE_OF_BATCH = IERC1155_OPS_START +
    OPCODE_IERC1155_BALANCE_OF_BATCH;

uint256 constant ALL_STANDARD_OPS_LENGTH = IERC1155_OPS_START +
    IERC1155_OPS_LENGTH;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    using Dispatch for DispatchTable;

    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        internal
        pure
        returns (int256)
    {
        if (opcode_ < FP_MATH_OPS_START) {
            return EVMConstantOps.stackIndexDiff(opcode_, operand_);
        } else if (opcode_ < MATH_OPS_START) {
            return
                FixedPointMathOps.stackIndexDiff(
                    opcode_ - FP_MATH_OPS_START,
                    operand_
                );
        } else if (opcode_ < LOGIC_OPS_START) {
            return MathOps.stackIndexDiff(opcode_ - MATH_OPS_START, operand_);
        } else if (opcode_ < TIER_OPS_START) {
            return LogicOps.stackIndexDiff(opcode_ - LOGIC_OPS_START, operand_);
        } else if (opcode_ < IERC20_OPS_START) {
            return TierOps.stackIndexDiff(opcode_ - TIER_OPS_START, operand_);
        } else if (opcode_ < IERC721_OPS_START) {
            return
                IERC20Ops.stackIndexDiff(opcode_ - IERC20_OPS_START, operand_);
        } else if (opcode_ < IERC1155_OPS_START) {
            return
                IERC721Ops.stackIndexDiff(
                    opcode_ - IERC721_OPS_START,
                    operand_
                );
        } else {
            return
                IERC1155Ops.stackIndexDiff(
                    opcode_ - IERC1155_OPS_START,
                    operand_
                );
        }
    }

    function dispatchTableBytes() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256, uint256) view returns (uint256) zeroFn_;
            function(uint256, uint256)
                view
                returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1]
                memory fns_ = [
                    zeroFn_,
                    zeroFn_,
                    zeroFn_,
                    zeroFn_,
                    zeroFn_,
                    zeroFn_,
                    EVMConstantOps.number,
                    EVMConstantOps.timestamp,
                    EVMConstantOps.caller,
                    EVMConstantOps.thisAddress,
                    FixedPointMathOps.scale18Mul,
                    FixedPointMathOps.scale18Div,
                    FixedPointMathOps.scale18,
                    FixedPointMathOps.scaleN,
                    FixedPointMathOps.scaleBy,
                    MathOps.add,
                    MathOps.saturatingAdd,
                    MathOps.sub,
                    MathOps.saturatingSub,
                    MathOps.mul,
                    MathOps.saturatingMul,
                    MathOps.div,
                    MathOps.mod,
                    MathOps.exp,
                    MathOps.min,
                    MathOps.max,
                    LogicOps.isZero,
                    LogicOps.eagerIf,
                    LogicOps.equalTo,
                    LogicOps.lessThan,
                    LogicOps.greaterThan,
                    LogicOps.every,
                    LogicOps.any,
                    TierOps.report,
                    TierOps.saturatingDiff,
                    TierOps.updateBlocksForTierRange,
                    TierOps.selectLte,
                    IERC20Ops.balanceOf,
                    IERC20Ops.totalSupply,
                    IERC721Ops.balanceOf,
                    IERC721Ops.ownerOf,
                    IERC1155Ops.balanceOf,
                    IERC1155Ops.balanceOfBatch
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }
}
