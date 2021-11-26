// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Stack, Op } from "../RainVM.sol";

enum Ops {
    add,
    sub,
    mul,
    pow,
    div,
    mod,
    length
}

library MathOps {

    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    pure
    {
        stack_.index -= op_.val;

        uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];

        for (uint256 a_ = 2; a_ <= op_.val; a_++) {
            uint256 item_ = stack_.vals[stack_.index + a_ - 2];
            if (op_.code == uint8(Ops.add)) {
                accumulator_ += item_;
            }
            else if (op_.code == uint8(Ops.sub)) {
                accumulator_ -= item_;
            }
            else if (op_.code == uint8(Ops.mul)) {
                accumulator_ *= item_;
            }
            else if (op_.code == uint8(Ops.pow)) {
                accumulator_ = accumulator_ ** item_;
            }
            else if (op_.code == uint8(Ops.div)) {
                accumulator_ /= item_;
            }
            else if (op_.code == uint8(Ops.mod)) {
                accumulator_ %= item_;
            }
        }
        stack_.vals[stack_.index] = accumulator_;
        stack_.index++;
    }

}