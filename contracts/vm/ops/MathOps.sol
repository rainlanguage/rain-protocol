// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";

library MathOps {

    uint constant internal ADD = 0;
    uint constant internal SUB = 1;
    uint constant internal MUL = 2;
    uint constant internal DIV = 3;
    uint constant internal MOD = 4;
    uint constant internal POW = 5;
    uint constant internal MIN = 6;
    uint constant internal MAX = 7;
    uint constant internal AVERAGE = 8;
    uint constant internal OPS_LENGTH = 9;

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
            if (op_.code == ADD) {
                accumulator_ += item_;
            }
            else if (op_.code == SUB) {
                accumulator_ -= item_;
            }
            else if (op_.code == MUL) {
                accumulator_ *= item_;
            }
            else if (op_.code == DIV) {
                accumulator_ /= item_;
            }
            else if (op_.code == MOD) {
                accumulator_ %= item_;
            }
            else if (op_.code == POW) {
                accumulator_ = accumulator_ ** item_;
            }
            else if (op_.code == MIN) {
                if (item_ < accumulator_) accumulator_ = item_;
            }
            else if (op_.code == MAX) {
                if (item_ > accumulator_) accumulator_ = item_;
            }
            else if (op_.code == AVERAGE) {
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