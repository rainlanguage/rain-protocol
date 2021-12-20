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
        if (op_.code == uint8(Ops.thisAddress)) {
            state_.stack[state_.stackIndex] = uint256(uint160(address(this)));
            state_.stackIndex++;
        }
    }

}