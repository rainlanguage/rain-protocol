// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

enum Ops {
    add,
    sub,
    mul,
    pow,
    div,
    mod,
    min,
    max,
    average,
    length
}

library MathOps {

    function applyOp(
        bytes memory,
        State memory state_,
        Op memory op_
    )
    internal
    pure
    {
        state_.stackIndex -= op_.val;

        uint256 accumulator_ = state_.stack[state_.stackIndex + op_.val - 1];

        for (uint256 a_ = 2; a_ <= op_.val; a_++) {
            uint256 item_ = state_.stack[state_.stackIndex + a_ - 2];
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
            else if (op_.code == uint8(Ops.min)) {
                if (item_ < accumulator_) accumulator_ = item_;
            }
            else if (op_.code == uint8(Ops.max)) {
                if (item_ > accumulator_) accumulator_ = item_;
            }
            else if (op_.code == uint8(Ops.average)) {
                accumulator_ = (accumulator_ & item_)
                    + (accumulator_ ^ item_) / 2;
            }
        }
        state_.stack[state_.stackIndex] = accumulator_;
        state_.stackIndex++;
    }

}