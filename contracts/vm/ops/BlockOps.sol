// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

library BlockOps {

    uint constant internal BLOCK_NUMBER = 0;
    uint constant internal OPS_LENGTH = 1;

    function applyOp(
        bytes memory,
        State memory state_,
        Op memory op_
    )
    internal
    view
    {
        unchecked {
            if (op_.code == BLOCK_NUMBER) {
                state_.stack[state_.stackIndex] = block.number;
                state_.stackIndex++;
            }
        }
    }

}