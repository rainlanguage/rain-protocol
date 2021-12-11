// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Stack, Op } from "../RainVM.sol";

import "hardhat/console.sol";

enum Ops {
    blockNumber,
    length
}

library BlockOps {
    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    view
    {
        if (op_.code == uint8(Ops.blockNumber)) {
            console.log("block number op");
            stack_.vals[stack_.index] = block.number;
            stack_.index++;
        }
    }

}