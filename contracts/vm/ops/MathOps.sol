// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../RainVM.sol";

enum Ops {
    add,
    sub,
    mul,
    pow,
    div,
    mod
}

abstract contract MathOps {
    uint8 public immutable mathOpsStart;
    uint8 public immutable opcodeAdd;
    uint8 public immutable opcodeSub;
    uint8 public immutable opcodeMul;
    uint8 public immutable opcodePow;
    uint8 public immutable opcodeDiv;
    uint8 public immutable opcodeMod;
    uint8 public constant MATH_OPS_LENGTH = 6;

    constructor(uint8 start_) {
        mathOpsStart = start_;
        opcodeAdd = start_ + uint8(Ops.add);
        opcodeSub = start_ + uint8(Ops.sub);
        opcodeMul = start_ + uint8(Ops.mul);
        opcodePow = start_ + uint8(Ops.pow);
        opcodeDiv = start_ + uint8(Ops.div);
        opcodeMod = start_ + uint8(Ops.mod);
    }

    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    returns (Stack memory) {
        if (mathOpsStart <= op_.code
            && op_.code < mathOpsStart + MATH_OPS_LENGTH
        ) {
            stack_.index -= op_.val;

            uint256 accumulator_ = stack_.vals[stack_.index + op_.val - 1];

            for (uint256 a_ = 2; a_ <= op_.val; a_++) {
                uint256 item_ = stack_.vals[stack_.index + a_ - 2];
                if (op_.code == opcodeAdd) {
                    accumulator_ += item_;
                }
                else if (op_.code == opcodeSub) {
                    accumulator_ -= item_;
                }
                else if (op_.code == opcodeMul) {
                    accumulator_ *= item_;
                }
                else if (op_.code == opcodePow) {
                    accumulator_ = accumulator_ ** item_;
                }
                else if (op_.code == opcodeDiv) {
                    accumulator_ /= item_;
                }
                else if (op_.code == opcodeMod) {
                    accumulator_ %= item_;
                }
                else {
                    // Unhandled opcode!
                    assert(false);
                }
            }
            stack_.vals[stack_.index] = accumulator_;
            stack_.index++;
        }

        return stack_;
    }

}