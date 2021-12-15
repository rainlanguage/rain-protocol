// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Stack, Op } from "../RainVM.sol";

enum Ops {
    thisAddress,
    length
}

library ThisOps {
    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    view
    {
        if (op_.code == uint8(Ops.thisAddress)) {
            stack_.vals[stack_.index] = uint256(uint160(address(this)));
            stack_.index++;
        }
    }

}