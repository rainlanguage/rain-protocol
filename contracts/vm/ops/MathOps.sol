// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Stack, Op } from "../RainVM.sol";

import "hardhat/console.sol";

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
        Stack memory stack_,
        Op memory op_
    )
    internal
    view
    {
        stack_.index -= op_.val;

        uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];

        for (uint256 a_ = 2; a_ <= op_.val; a_++) {
            uint256 item_ = stack_.vals[stack_.index + a_ - 2];
            if (op_.code == uint8(Ops.add)) {
                console.log("add: %s %s", accumulator_, item_);
                accumulator_ += item_;
                console.log("add result: %s", accumulator_);
            }
            else if (op_.code == uint8(Ops.sub)) {
                accumulator_ -= item_;
            }
            else if (op_.code == uint8(Ops.mul)) {
                console.log("mul: %s %s", accumulator_, item_);
                accumulator_ *= item_;
                console.log("mul result: %s", accumulator_);
            }
            else if (op_.code == uint8(Ops.pow)) {
                accumulator_ = accumulator_ ** item_;
            }
            else if (op_.code == uint8(Ops.div)) {
                console.log("div %s %s", accumulator_, item_);
                accumulator_ /= item_;
                console.log("div result: %s", accumulator_);
            }
            else if (op_.code == uint8(Ops.mod)) {
                accumulator_ %= item_;
            }
            else if (op_.code == uint8(Ops.min)) {
                console.log("min %s %s", accumulator_, item_);
                if (item_ < accumulator_) accumulator_ = item_;
                console.log("min result: %s", accumulator_);
            }
            else if (op_.code == uint8(Ops.max)) {
                if (item_ > accumulator_) accumulator_ = item_;
            }
            else if (op_.code == uint8(Ops.average)) {
                accumulator_ = (accumulator_ & item_)
                    + (accumulator_ ^ item_) / 2;
            }
        }
        stack_.vals[stack_.index] = accumulator_;
        stack_.index++;
    }

}