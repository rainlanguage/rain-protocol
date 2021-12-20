// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

enum Ops {
    blockNumber,
    length
}

library BlockOps {
    function applyOp(
        bytes memory,
        State memory state_,
        Op memory op_
    )
    internal
    view
    {
        if (op_.code == uint8(Ops.blockNumber)) {
            state_.stack[state_.stackIndex] = block.number;
            state_.stackIndex++;
        }
    }

}