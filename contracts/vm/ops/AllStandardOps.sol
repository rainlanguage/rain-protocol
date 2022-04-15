// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State, RainVM, DispatchTable, Dispatch, RAIN_VM_OPS_LENGTH} from "../RainVM.sol";
import "./evm/EVMConstantOps.sol";
// solhint-disable-next-line max-line-length
import {FixedPointMathOps, FIXED_POINT_MATH_OPS_LENGTH} from "./math/FixedPointMathOps.sol";
import "./token/IERC20Ops.sol";
import "./token/IERC721Ops.sol";
import "./token/IERC1155Ops.sol";
import "./math/LogicOps.sol";
import "./math/MathOps.sol";
import "./tier/TierOps.sol";

import "hardhat/console.sol";

uint256 constant ALL_STANDARD_OPS_START = RAIN_VM_OPS_LENGTH;

uint constant EVM_OPCODE_BLOCK_NUMBER = ALL_STANDARD_OPS_START + OPCODE_BLOCK_NUMBER;
uint constant EVM_OPCODE_BLOCK_TIMESTAMP = ALL_STANDARD_OPS_START + OPCODE_BLOCK_TIMESTAMP;
uint constant EVM_OPCODE_CALLER = ALL_STANDARD_OPS_START + OPCODE_CALLER;
uint constant EVM_OPCODE_THIS_ADDRESS = ALL_STANDARD_OPS_START + OPCODE_THIS_ADDRESS;

uint256 constant FIXED_POINT_MATH_OPS_START = ALL_STANDARD_OPS_START +
    EVM_CONSTANT_OPS_LENGTH;

uint256 constant MATH_OPS_START = FIXED_POINT_MATH_OPS_START +
    FIXED_POINT_MATH_OPS_LENGTH;
uint256 constant MATH_OPCODE_ADD = MATH_OPS_START + OPCODE_ADD;
uint256 constant MATH_OPCODE_SATURATING_ADD = MATH_OPS_START + OPCODE_SATURATING_ADD;
uint256 constant MATH_OPCODE_SUB = MATH_OPS_START + OPCODE_SUB;
uint256 constant MATH_OPCODE_SATURATING_SUB = MATH_OPS_START + OPCODE_SATURATING_SUB;
uint256 constant MATH_OPCODE_MUL = MATH_OPS_START + OPCODE_MUL;
uint256 constant MATH_OPCODE_SATURATING_MUL = MATH_OPS_START + OPCODE_SATURATING_MUL;
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
uint256 constant TIER_OPCODE_SATURATING_DIFF = TIER_OPS_START + OPCODE_SATURATING_DIFF;
uint256 constant TIER_OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE = TIER_OPS_START + OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE;
uint256 constant TIER_OPCODE_SELECT_LTE = TIER_OPS_START + OPCODE_SELECT_LTE;

uint256 constant IERC20_OPS_START = TIER_OPS_START + TIER_OPS_LENGTH;
uint constant IERC20_OPCODE_IERC20_BALANCE_OF = IERC20_OPS_START + OPCODE_IERC20_BALANCE_OF;
uint constant IERC20_OPCODE_IERC20_TOTAL_SUPPLY = IERC20_OPS_START + OPCODE_IERC20_TOTAL_SUPPLY;

uint256 constant IERC721_OPS_START = IERC20_OPS_START + IERC20_OPS_LENGTH;
uint constant IERC721_OPCODE_IERC721_BALANCE_OF = IERC721_OPS_START + OPCODE_IERC721_BALANCE_OF;
uint constant IERC721_OPCODE_IERC721_OWNER_OF = IERC721_OPS_START + OPCODE_IERC721_OWNER_OF;

uint256 constant IERC1155_OPS_START = IERC721_OPS_START + IERC721_OPS_LENGTH;
uint constant IERC1155_OPCODE_IERC1155_BALANCE_OF = IERC1155_OPS_START + OPCODE_IERC1155_BALANCE_OF;
uint constant IERC1155_OPCODE_IERC1155_BALANCE_OF_BATCH = IERC1155_OPS_START + OPCODE_IERC1155_BALANCE_OF_BATCH;

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
        if (opcode_ < FIXED_POINT_MATH_OPS_START) {
            return EVMConstantOps.stackIndexDiff(opcode_, operand_);
        } else if (opcode_ < MATH_OPS_START) {
            return
                FixedPointMathOps.stackIndexDiff(
                    opcode_ - FIXED_POINT_MATH_OPS_START,
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

    function dispatchTable() internal view returns (DispatchTable) {
        uint[] memory fnPtrs_ = new uint[](ALL_STANDARD_OPS_LENGTH);
        DispatchTable dispatchTable_;
        dispatchTable_ = dispatchTable_.initialize(fnPtrs_);
        dispatchTable_.setFn(EVM_OPCODE_BLOCK_NUMBER, EVMConstantOps.number);
        dispatchTable_.setFn(EVM_OPCODE_BLOCK_TIMESTAMP, EVMConstantOps.timestamp);
        dispatchTable_.setFn(EVM_OPCODE_CALLER, EVMConstantOps.caller);
        dispatchTable_.setFn(EVM_OPCODE_THIS_ADDRESS, EVMConstantOps.thisAddress);
        dispatchTable_.setFn(MATH_OPCODE_ADD, MathOps.add);
        dispatchTable_.setFn(MATH_OPCODE_SATURATING_ADD, MathOps.saturatingAdd);
        dispatchTable_.setFn(MATH_OPCODE_SUB, MathOps.sub);
        dispatchTable_.setFn(MATH_OPCODE_SATURATING_SUB, MathOps.saturatingSub);
        dispatchTable_.setFn(MATH_OPCODE_MUL, MathOps.mul);
        dispatchTable_.setFn(MATH_OPCODE_SATURATING_MUL, MathOps.saturatingMul);
        dispatchTable_.setFn(MATH_OPCODE_DIV, MathOps.div);
        dispatchTable_.setFn(MATH_OPCODE_MOD, MathOps.mod);
        dispatchTable_.setFn(MATH_OPCODE_EXP, MathOps.exp);
        dispatchTable_.setFn(MATH_OPCODE_MIN, MathOps.min);
        dispatchTable_.setFn(MATH_OPCODE_MAX, MathOps.max);
        dispatchTable_.setFn(LOGIC_OPCODE_ISZERO, LogicOps.isZero);
        dispatchTable_.setFn(LOGIC_OPCODE_EAGER_IF, LogicOps.eagerIf);
        dispatchTable_.setFn(LOGIC_OPCODE_EQUAL_TO, LogicOps.equalTo);
        dispatchTable_.setFn(LOGIC_OPCODE_LESS_THAN, LogicOps.lessThan);
        dispatchTable_.setFn(LOGIC_OPCODE_GREATER_THAN, LogicOps.greaterThan);
        dispatchTable_.setFn(LOGIC_OPCODE_EVERY, LogicOps.every);
        dispatchTable_.setFn(LOGIC_OPCODE_ANY, LogicOps.any);
        dispatchTable_.setFn(TIER_OPCODE_REPORT, TierOps.report);
        dispatchTable_.setFn(TIER_OPCODE_SATURATING_DIFF, TierOps.saturatingDiff);
        dispatchTable_.setFn(TIER_OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE, TierOps.updateBlocksForTierRange);
        dispatchTable_.setFn(TIER_OPCODE_SELECT_LTE, TierOps.selectLte);
        dispatchTable_.setFn(IERC20_OPCODE_IERC20_BALANCE_OF, IERC20Ops.balanceOf);
        dispatchTable_.setFn(IERC20_OPCODE_IERC20_TOTAL_SUPPLY, IERC20Ops.totalSupply);
        dispatchTable_.setFn(IERC721_OPCODE_IERC721_BALANCE_OF, IERC721Ops.balanceOf);
        dispatchTable_.setFn(IERC721_OPCODE_IERC721_OWNER_OF, IERC721Ops.ownerOf);
        dispatchTable_.setFn(IERC1155_OPCODE_IERC1155_BALANCE_OF, IERC1155Ops.balanceOf);
        dispatchTable_.setFn(IERC1155_OPCODE_IERC1155_BALANCE_OF_BATCH, IERC1155Ops.balanceOfBatch);
        return dispatchTable_;
    }
}
