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
        uint accumulator_;
        uint item_;
        uint opval_ = op_.val;
        unchecked {
            state_.stackIndex -= opval_;
            accumulator_ = state_.stack[state_.stackIndex + opval_ - 1];
        }

        for (uint a_ = 2; a_ <= opval_; a_++) {
            unchecked {
                item_ = state_.stack[state_.stackIndex + a_ - 2];
            }
            if (op_.code == 0) {
                accumulator_ += item_;
            }
            else if (op_.code == 1) {
                accumulator_ -= item_;
            }
            else if (op_.code == 2) {
                accumulator_ *= item_;
            }
            else if (op_.code == 3) {
                accumulator_ = accumulator_ ** item_;
            }
            else if (op_.code == 4) {
                accumulator_ /= item_;
            }
            else if (op_.code == 5) {
                accumulator_ %= item_;
            }
            else if (op_.code == 6) {
                if (item_ < accumulator_) accumulator_ = item_;
            }
            else if (op_.code == 7) {
                if (item_ > accumulator_) accumulator_ = item_;
            }
            else if (op_.code == 8) {
                accumulator_ = (accumulator_ & item_)
                    + (accumulator_ ^ item_) / 2;
            }
        }

        unchecked {
            state_.stack[state_.stackIndex] = accumulator_;
            state_.stackIndex++;
        }
    }

}