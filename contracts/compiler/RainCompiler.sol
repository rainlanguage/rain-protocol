// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

struct CompileIO {
    Op input;
    Op output;
}

struct CompiledSource {
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
    uint8 argSize;
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
    uint8 public constant MAX_COMPILED_SOURCE_LENGTH = 128;
    uint8 public constant LIT_SIZE_BYTES = 32;

    uint8 public constant OPCODE_END = 0;
    uint8 public constant OPCODE_LIT = 1;
    uint8 public constant OPCODE_ARG = 2;

    uint8 public constant OPCODE_VAL = 3;
    uint8 public constant OPCODE_CALL = 4;

    uint8 public constant OPCODE_BLOCK_NUMBER = 5;

    uint8 public constant OPCODE_RESERVED_MAX = 5;

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
        bytes memory source_,
        uint256[] memory args_
    )
    public {
        CompiledSource memory compiledSource_ = compile(
            source_,
            args_
        );

        val0 = compiledSource_.vals[0];
        val1 = compiledSource_.vals[1];
        val2 = compiledSource_.vals[2];
        val3 = compiledSource_.vals[3];
        val4 = compiledSource_.vals[4];
        val5 = compiledSource_.vals[5];
        val6 = compiledSource_.vals[6];
        val7 = compiledSource_.vals[7];
        val8 = compiledSource_.vals[8];
        val9 = compiledSource_.vals[9];
        val10 = compiledSource_.vals[10];
        val11 = compiledSource_.vals[11];
        val12 = compiledSource_.vals[12];
        val13 = compiledSource_.vals[13];
        val14 = compiledSource_.vals[14];
        val15 = compiledSource_.vals[15];

        source0 = compiledSource_.source[0];
        source1 = compiledSource_.source[1];
        source2 = compiledSource_.source[2];
        source3 = compiledSource_.source[3];
    }

    function compiledSource() internal view returns(CompiledSource memory) {
        return CompiledSource([
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

    function compile(
        bytes memory inputSource_,
        uint256[] memory args_
    ) internal view returns (CompiledSource memory) {
        // SourceCursor memory inputSourceCursor_;
        CompiledSource memory outputSource_;
        SourceCursor memory outputSourceCursor_;
        uint256 o_ = 0;
        uint8 valsIndex_ = 0;

        uint256 rtl_ = (inputSource_.length - 2);
        for (uint256 i_ = 0; i_ < inputSource_.length; i_ = i_ + 2) {
            CompileIO memory compileIO_ = CompileIO(
                Op(
                    uint8(inputSource_[rtl_ - i_]),
                    uint8(inputSource_[rtl_ - i_ + 1])
                ),
                Op(
                    0,
                    0
                )
            );
            outputSourceCursor_.item = uint8(o_.div(16));
            outputSourceCursor_.index = uint8(o_.mod(16));
            o_ += 2;

            if (compileIO_.input.code == OPCODE_END) {
                break;
            }

            // OPCODE_VAL can ONLY be an output opcode.
            require(compileIO_.input.code != OPCODE_VAL, "INPUT_OPCODE_VAL");

            // OPCODE_LIT and OPCODE_ARG are special opcodes that can only
            // exist at compile time. Both compile to OPCODE_VAL and place a
            // single uint256 value into vals_ to be referenced by OPCODE_VAL.
            // OPCODE_LIT takes the uint256 directly from the following 32
            // bytes in the source code. The OPCODE_LIT operand is ignored.
            // OPCODE_ARG takes the uint256 from the `args_` to `compile`.
            // The OPCODE_ARG operand is the index into `args_`.
            if (compileIO_.input.code == OPCODE_LIT
                || compileIO_.input.code == OPCODE_ARG) {
                uint256 val_ = 0;
                // Literal opcode means copy the 32 bytes after the operand
                // byte out of the source and into vals_.
                if (compileIO_.input.code == OPCODE_LIT) {
                    for (uint j_ = 0; j_ < LIT_SIZE_BYTES; j_++) {
                        val_ |= uint256(
                            uint256(uint8(inputSource_[i_ + j_ + 2]))
                                << (256 - (8 * (j_ + 1)))
                        );
                    }
                    // Move i_ forward 32 to compensate for the literal bytes.
                    i_ += LIT_SIZE_BYTES;

                    compileIO_.output.code = OPCODE_VAL;
                }

                if (compileIO_.input.code == OPCODE_ARG) {
                    val_ = args_[compileIO_.input.val];
                    compileIO_.output.code = OPCODE_VAL;
                }

                outputSource_.vals[valsIndex_] = val_;
                compileIO_.output.val = valsIndex_;
                valsIndex_++;
            }
            else {
                compileIO_.output.code = compileIO_.input.code;
                compileIO_.output.val = compileIO_.input.val;
            }

            outputSource_.source[outputSourceCursor_.item]
                ^= uint256(
                    uint256(compileIO_.output.code)
                        << (outputSourceCursor_.index * 8)
                );
            outputSource_.source[outputSourceCursor_.item]
                ^= uint256(
                    uint256(compileIO_.output.val)
                        << ((outputSourceCursor_.index + 1) * 8)
                );
        }
        return outputSource_;
    }

    function call(
        bytes memory context_,
        Stack memory stack_,
        CallSize memory callSize_
    ) internal view returns (Stack memory) {
        stack_.index -= (callSize_.fnSize + callSize_.argSize + 2);
        bytes memory mapSource_;
        uint256 fnIndex_ = stack_.index + callSize_.argSize + 1;
        if (callSize_.fnSize == 0) {
            mapSource_ = abi.encodePacked(
                stack_.vals[fnIndex_]
            );
        }
        else if (callSize_.fnSize == 1) {
            mapSource_ = abi.encodePacked(
                stack_.vals[fnIndex_],
                stack_.vals[fnIndex_ + 1]
            );
        }
        else if (callSize_.fnSize == 2) {
            mapSource_ = abi.encodePacked(
                stack_.vals[fnIndex_],
                stack_.vals[fnIndex_ + 1],
                stack_.vals[fnIndex_ + 2]
            );
        }
        else if (callSize_.fnSize == 3) {
            mapSource_ = abi.encodePacked(
                stack_.vals[fnIndex_],
                stack_.vals[fnIndex_ + 1],
                stack_.vals[fnIndex_ + 2],
                stack_.vals[fnIndex_ + 3]
            );
        }
        uint256[] memory baseArgs_ = new uint256[](
            callSize_.argSize + 1
        );
        for (uint256 a_ = 0; a_ < callSize_.argSize + 1; a_++) {
            baseArgs_[a_] = stack_.vals[stack_.index + a_];
        }

        // Each loop size halves the item size.
        uint256 stepSize_ = 256 >> callSize_.loopSize;

        uint256[] memory args_ = new uint256[](baseArgs_.length);
        for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = uint256(
                    uint256(baseArgs_[a_] << step_)
                    >> 256 - stepSize_
                );
            }
            CompiledSource memory mapCompiledSource_ = compile(
                mapSource_,
                args_
            );
            Stack memory mapStack_;
            mapStack_ = eval(
                context_,
                mapStack_,
                mapCompiledSource_
            );

            for (uint256 m_ = 0; m_ < mapStack_.index; m_++) {
                stack_.vals[stack_.index + m_] = mapStack_.vals[m_];
            }
            stack_.index = stack_.index + mapStack_.index;
        }
        return stack_;
    }

    function eval(
        bytes memory context_,
        Stack memory stack_,
        CompiledSource memory compiledSource_
    ) internal view returns (Stack memory) {
        for (uint256 i_ = 0; i_ < MAX_COMPILED_SOURCE_LENGTH; i_ = i_ + 2) {
            SourceCursor memory sourceCursor_ = SourceCursor(
                uint8(i_.div(32)),
                uint8(i_.mod(32))
            );

            Op memory op_ = Op(
                uint8(
                    uint256(compiledSource_.source[sourceCursor_.item]
                        >> (sourceCursor_.index * 8)
                    )
                ),
                uint8(
                    uint256(compiledSource_.source[sourceCursor_.item]
                        >> ((sourceCursor_.index + 1) * 8)
                    )
                )
            );

            if (op_.code <= OPCODE_RESERVED_MAX) {
                if (op_.code == OPCODE_VAL) {
                    stack_.vals[stack_.index] = compiledSource_.vals[op_.val];
                    stack_.index++;
                }
                else if (op_.code == OPCODE_CALL) {
                    stack_ = call(
                        context_,
                        stack_,
                        CallSize(
                            op_.val & 0x03, // 00000011
                            op_.val & 0x1C, // 00011100
                            op_.val & 0xE0 // 11100000
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
