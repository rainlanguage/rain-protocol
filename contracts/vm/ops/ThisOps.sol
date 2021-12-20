// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

enum Ops {
    thisAddress,
    length
}

library ThisOps {
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
                state_.stack[state_.stackIndex]
                    = uint256(uint160(address(this)));
                state_.stackIndex++;
            }
        }
    }

}