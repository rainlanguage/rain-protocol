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
        unchecked {
            if (op_.code == 0) {
                state_.stack[state_.stackIndex] = block.number;
                state_.stackIndex++;
            }
        }
    }

}