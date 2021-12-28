// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

library ThisOps {
    uint constant internal THIS_ADDRESS = 0;
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
            if (op_.code == THIS_ADDRESS) {
                state_.stack[state_.stackIndex]
                    = uint256(uint160(address(this)));
                state_.stackIndex++;
            }
        }
    }

}