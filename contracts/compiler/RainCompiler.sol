// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

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

abstract contract RainCompiler {
    using Math for uint256;
    using SafeMath for uint256;

    // 32 bytes * 4 items.
    uint8 public constant MAX_SOURCE_LENGTH = 128;

    uint8 public constant OPCODE_END = 0;
    uint8 public constant OPCODE_VAL = 1;
    uint8 public constant OPCODE_CALL = 2;

    uint8 public constant OPCODE_BLOCK_NUMBER = 3;

    uint8 public constant OPCODE_RESERVED_MAX = 3;

    uint256 public immutable val0;
    uint256 public immutable val1;
    uint256 public immutable val2;
    uint256 public immutable val3;
    uint256 public immutable val4;
    uint256 public immutable val5;
    uint256 public immutable val6;
    uint256 public immutable val7;
    uint256 public immutable val8;
    uint256 public immutable val9;
    uint256 public immutable val10;
    uint256 public immutable val11;
    uint256 public immutable val12;
    uint256 public immutable val13;
    uint256 public immutable val14;
    uint256 public immutable val15;

    uint256 public immutable source0;
    uint256 public immutable source1;
    uint256 public immutable source2;
    uint256 public immutable source3;

    constructor(
        Source memory source_
    )
    public {
        val0 = source_.vals[0];
        val1 = source_.vals[1];
        val2 = source_.vals[2];
        val3 = source_.vals[3];
        val4 = source_.vals[4];
        val5 = source_.vals[5];
        val6 = source_.vals[6];
        val7 = source_.vals[7];
        val8 = source_.vals[8];
        val9 = source_.vals[9];
        val10 = source_.vals[10];
        val11 = source_.vals[11];
        val12 = source_.vals[12];
        val13 = source_.vals[13];
        val14 = source_.vals[14];
        val15 = source_.vals[15];

        source0 = source_.source[0];
        source1 = source_.source[1];
        source2 = source_.source[2];
        source3 = source_.source[3];
    }

    function source() internal view returns(Source memory) {
        return Source([
            source0,
            source1,
            source2,
            source3
        ],
        [
            val0,
            val1,
            val2,
            val3,
            val4,
            val5,
            val6,
            val7,
            val8,
            val9,
            val10,
            val11,
            val12,
            val13,
            val14,
            val15
        ]);
    }

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

        uint256[] memory baseVals_ = new uint256[](
            callSize_.valSize + 1
        );
        for (uint256 a_ = 0; a_ < callSize_.valSize + 1; a_++) {
            baseVals_[a_] = stack_.vals[stack_.index + a_];
        }

        // Each loop size halves the item size.
        uint256 stepSize_ = 256 >> callSize_.loopSize;

        for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
            uint256[16] memory vals_;
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(baseVals_[a_] << step_)
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
                uint8(i_.div(32)),
                uint8(i_.mod(32))
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
                            op_.val & 0x03, // 00000011
                            op_.val & 0x1C, // 00011100
                            op_.val & 0xE0  // 11100000
                        )
                    );
                }
                else if (op_.code == OPCODE_BLOCK_NUMBER) {
                    stack_.vals[stack_.index] = block.number;
                    stack_.index++;
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
