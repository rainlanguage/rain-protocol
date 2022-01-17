// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../../vm/RainVM.sol";

struct Context {
    uint256 startBlock;
    uint256 remainingUnits;
    uint256 totalReserveIn;
    uint256 lastBuyUnits;
    uint256 lastBuyBlock;
    uint256 lastBuyPrice;
}

library SaleOps {
    uint256 private constant START_BLOCK = 0;
    uint256 private constant REMAINING_UNITS = 1;
    uint256 private constant TOTAL_RESERVE_IN = 2;
    uint256 private constant LAST_RESERVE_IN = 3;

    uint256 private constant LAST_BUY_BLOCK = 4;
    uint256 private constant LAST_BUY_UNITS = 5;
    uint256 private constant LAST_BUY_PRICE = 6;

    uint256 private constant HIGHEST_PRICE = 7;
    uint256 private constant LOWEST_PRICE = 8;

    uint256 internal constant OPS_LENGTH = 9;

    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal pure {
        require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
        Context memory context_ = abi.decode(context_, (Context));

        if (opcode_ == START_BLOCK) {
            state_.stack[state_.stackIndex] = context_.startBlock;
        } else if (opcode_ == REMAINING_UNITS) {
            state_.stack[state_.stackIndex] = context_.remainingUnits;
        } else if (opcode_ == TOTAL_RESERVE_IN) {
            state_.stack[state_.stackIndex] = context_.totalReserveIn;
        } else if (opcode_ == LAST_RESERVE_IN) {
            state_.stack[state_.stackIndex] =
                context_.lastBuyUnits *
                context_.lastBuyPrice;
        } else if (opcode_ == LAST_BUY_BLOCK) {
            state_.stack[state_.stackIndex] = context_.lastBuyBlock;
        } else if (opcode_ == LAST_BUY_UNITS) {
            state_.stack[state_.stackIndex] = context_.lastBuyUnits;
        } else if (opcode_ == LAST_BUY_PRICE) {
            state_.stack[state_.stackIndex] = context_.lastBuyPrice;
        }

        state_.stackIndex++;
    }
}
