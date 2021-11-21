// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";

struct CompileIO {
    Op input;
    Op output;
}

struct Source {
    uint256[4] source;
    uint256[16] vals;
}

struct SourceCursor {
    uint8 item;
    uint8 index;
}

struct CallSize {
    uint8 fnSize;
    uint8 loopSize;
    uint8 valSize;
}

struct Stack {
    uint256[32] vals;
    uint8 index;
}

struct Op {
    uint8 code;
    uint8 val;
}

abstract contract RainVM {
    using Math for uint256;

    // 32 bytes * 4 items.
    uint8 public constant MAX_SOURCE_LENGTH = 128;

    uint8 public constant OPCODE_END = 0;
    uint8 public constant OPCODE_VAL = 1;
    uint8 public constant OPCODE_CALL = 2;

    uint8 public constant OPCODE_RESERVED_MAX = 2;

    function call(
        bytes memory context_,
        Stack memory stack_,
        CallSize memory callSize_
    ) internal view returns (Stack memory) {
        stack_.index -= (callSize_.fnSize + callSize_.valSize + 2);

        uint256[4] memory mapSource_;

        uint256 fnIndex_ = stack_.index + callSize_.valSize + 1;

        for (uint256 f_ = 0; f_ <= callSize_.fnSize; f_++) {
            mapSource_[f_] = stack_.vals[fnIndex_ + f_];
        }

        uint256[16] memory baseVals_;
        for (uint256 a_ = 0; a_ < callSize_.valSize + 1; a_++) {
            baseVals_[a_] = stack_.vals[a_];
        }

        uint256 stepSize_ = 256 >> callSize_.loopSize;

        for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
            uint256[16] memory vals_;
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(baseVals_[a_] << 256 - step_ - stepSize_)
                    >> 256 - stepSize_
                );
            }
            Source memory evalSource_ = Source(mapSource_, vals_);
            Stack memory evalStack_;
            evalStack_ = eval(
                context_,
                evalSource_,
                evalStack_
            );

            for (uint256 m_ = 0; m_ < evalStack_.index; m_++) {
                stack_.vals[stack_.index + m_] = evalStack_.vals[m_];
            }
            stack_.index = stack_.index + evalStack_.index;
        }
        return stack_;
    }

    function eval(
        bytes memory context_,
        Source memory source_,
        Stack memory stack_
    ) internal view returns (Stack memory) {
        for (uint256 i_ = 0; i_ < MAX_SOURCE_LENGTH; i_ = i_ + 2) {
            SourceCursor memory sourceCursor_ = SourceCursor(
                uint8(i_ / 32),
                uint8(i_ % 32)
            );

            Op memory op_ = Op(
                uint8(
                    uint256(source_.source[sourceCursor_.item]
                        >> (sourceCursor_.index * 8)
                    )
                ),
                uint8(
                    uint256(source_.source[sourceCursor_.item]
                        >> ((sourceCursor_.index + 1) * 8)
                    )
                )
            );

            if (op_.code <= OPCODE_RESERVED_MAX) {
                if (op_.code == OPCODE_END) {
                    break;
                }
                else if (op_.code == OPCODE_VAL) {
                    stack_.vals[stack_.index] = source_.vals[op_.val];
                    stack_.index++;
                }
                else if (op_.code == OPCODE_CALL) {
                    stack_ = call(
                        context_,
                        stack_,
                        CallSize(
                            op_.val & 0x03,
                            (op_.val & 0x1C) >> 2,
                            (op_.val & 0xE0) >> 5
                        )
                    );
                }
            }
            else {
                stack_ = applyOp(
                    context_,
                    stack_,
                    op_
                );
            }
        }

        return stack_;
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    // solhint-disable-next-line no-empty-blocks
    returns (Stack memory) { }
}
