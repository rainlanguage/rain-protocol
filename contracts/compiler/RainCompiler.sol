// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

abstract contract RainCompiler {
    using Math for uint256;
    using SafeMath for uint256;

    // 32 bytes * 4 items.
    uint8 public constant MAX_COMPILED_SOURCE_LENGTH = 128;

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
        bytes memory source_
    )
    public {
        (
            uint256[4] memory compiledSource_,
            uint256[16] memory vals_
        ) = compile(
            source_,
            new uint256[](0)
        );

        val0 = vals_[0];
        val1 = vals_[1];
        val2 = vals_[2];
        val3 = vals_[3];
        val4 = vals_[4];
        val5 = vals_[5];
        val6 = vals_[6];
        val7 = vals_[7];
        val8 = vals_[8];
        val9 = vals_[9];
        val10 = vals_[10];
        val11 = vals_[11];
        val12 = vals_[12];
        val13 = vals_[13];
        val14 = vals_[14];
        val15 = vals_[15];

        source0 = compiledSource_[0];
        source1 = compiledSource_[1];
        source2 = compiledSource_[2];
        source3 = compiledSource_[3];
    }

    function source() internal view returns(uint256[4] memory) {
        return [
            source0,
            source1,
            source2,
            source3
        ];
    }

    function vals() internal view returns (uint256[16] memory) {
        return [
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
        ];
    }

    struct CompileIO {
        uint8 inputOpcode;
        uint8 inputOperand;
        uint8 outputOpcode;
        uint8 outputOperand;
    }

    function compile(
        bytes memory inputSource_,
        uint256[] memory args_
    ) internal pure returns (uint256[4] memory, uint256[16] memory) {
        uint256[16] memory vals_;
        uint8 valsIndex_ = 0;

        uint256[4] memory outputSource_;

        for (uint256 i_ = 0; i_ < inputSource_.length; i_ = i_ + 2) {
            CompileIO memory compileIO_ = CompileIO(
                uint8(inputSource_[i_]),
                uint8(inputSource_[i_ + 1]),
                0,
                0
            );

            uint256 outputSourceItem_ = i_.div(16);
            uint256 outputSourceIndex_ = i_.mod(16);

            if (compileIO_.inputOpcode == OPCODE_END) {
                break;
            }

            // OPCODE_VAL can ONLY be an output opcode.
            require(compileIO_.inputOpcode != OPCODE_VAL, "INPUT_OPCODE_VAL");

            // OPCODE_LIT and OPCODE_ARG are special opcodes that can only
            // exist at compile time. Both compile to OPCODE_VAL and place a
            // single uint256 value into vals_ to be referenced by OPCODE_VAL.
            // OPCODE_LIT takes the uint256 directly from the following 32
            // bytes in the source code. The OPCODE_LIT operand is ignored.
            // OPCODE_ARG takes the uint256 from the `args_` to `compile`.
            // The OPCODE_ARG operand is the index into `args_`.
            if (compileIO_.inputOpcode == OPCODE_LIT
                || compileIO_.inputOpcode == OPCODE_ARG) {
                uint256 val_ = 0;
                // Literal opcode means copy the 32 bytes after the operand
                // byte out of the source and into vals_.
                if (compileIO_.inputOpcode == OPCODE_LIT) {
                    for (uint j_ = 1; j_ <= 32; j_++) {
                        val_ = val_ | uint256(
                            uint256(uint8(inputSource_[i_ + j_])) << (32 - j_)
                        );
                    }
                    // Move i_ forward 32 to compensate for the literal bytes.
                    i_ = i_ + 32;

                    compileIO_.outputOpcode = OPCODE_VAL;
                }

                if (compileIO_.inputOpcode == OPCODE_ARG) {
                    val_ = args_[compileIO_.inputOperand];
                    compileIO_.outputOpcode = OPCODE_VAL;
                }

                vals_[valsIndex_] = val_;
                compileIO_.outputOperand = valsIndex_;
                valsIndex_++;
            }
            else {
                compileIO_.outputOpcode = compileIO_.inputOpcode;
                compileIO_.outputOperand = compileIO_.inputOperand;
            }

            outputSource_[outputSourceItem_] = outputSource_[outputSourceItem_]
            | uint256(
                uint256(
                    compileIO_.outputOpcode << 8
                    | compileIO_.outputOperand
                )
                << 16 - outputSourceIndex_
            );
        }
        return (outputSource_, vals_);
    }

    struct CallSize {
        uint8 fnSize;
        uint8 loopSize;
        uint8 argSize;
    }

    function eval(
        bytes memory context_,
        uint256[32] memory stack_,
        uint8 stackIndex_,
        uint256[4] memory source_,
        uint256[16] memory vals_
    ) internal view returns (uint256[32] memory, uint8) {
        for (uint256 i_ = 0; i_ < MAX_COMPILED_SOURCE_LENGTH; i_ = i_ + 2) {
            uint256 sourceItem_ = i_.div(16);
            uint256 sourceIndex_ = i_.mod(16);

            uint8 opcode_ = uint8(
                uint256(source_[sourceItem_] >> (32 - (sourceIndex_ + 8)))
            );
            uint8 operand_ = uint8(
                uint256(source_[sourceItem_] >> (32 - (sourceIndex_ + 1 + 8)))
            );

            if (opcode_ == OPCODE_VAL) {
                stack_[stackIndex_] = vals_[operand_];
                stackIndex_++;
            }

            else if (opcode_ == OPCODE_CALL) {
                CallSize memory callSize_ = CallSize(
                    operand_ & 0x03, // 00000011
                    operand_ & 0x1C, // 00011100
                    operand_ & 0xE0 // 11100000
                );

                stackIndex_ -= (callSize_.fnSize + callSize_.argSize + 2);
                bytes memory mapSource_;
                if (callSize_.fnSize == 0) {
                    mapSource_ = abi.encodePacked(
                        stack_[stackIndex_ + callSize_.argSize + 1]
                    );
                }
                else if (callSize_.fnSize == 1) {
                    mapSource_ = abi.encodePacked(
                        stack_[stackIndex_ + callSize_.argSize + 1],
                        stack_[stackIndex_ + callSize_.argSize + 2]
                    );
                }
                else if (callSize_.fnSize == 2) {
                    mapSource_ = abi.encodePacked(
                        stack_[stackIndex_ + callSize_.argSize + 1],
                        stack_[stackIndex_ + callSize_.argSize + 2],
                        stack_[stackIndex_ + callSize_.argSize + 3]
                    );
                }
                else if (callSize_.fnSize == 3) {
                    mapSource_ = abi.encodePacked(
                        stack_[stackIndex_ + callSize_.argSize + 1],
                        stack_[stackIndex_ + callSize_.argSize + 2],
                        stack_[stackIndex_ + callSize_.argSize + 3],
                        stack_[stackIndex_ + callSize_.argSize + 4]
                    );
                }
                uint256[] memory baseArgs_ = new uint256[](
                    callSize_.argSize + 1
                );
                for (uint256 a_ = 0; a_ < callSize_.argSize + 1; a_++) {
                    baseArgs_[a_] = stack_[stackIndex_ + a_];
                }

                uint256 stepSize_;
                if (callSize_.loopSize == 0) {
                    stepSize_ = 256;
                }
                else if (callSize_.loopSize == 1) {
                    stepSize_ = 128;
                }
                else if (callSize_.loopSize == 2) {
                    stepSize_ = 64;
                }
                else if (callSize_.loopSize == 3) {
                    stepSize_ = 32;
                }
                else if (callSize_.loopSize == 4) {
                    stepSize_ = 16;
                }
                else if (callSize_.loopSize == 5) {
                    stepSize_ = 8;
                }
                else if (callSize_.loopSize == 6) {
                    stepSize_ = 4;
                }
                else if (callSize_.loopSize == 7) {
                    stepSize_ = 2;
                }

                uint256[] memory args_ = new uint256[](baseArgs_.length);
                for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
                    for (uint256 a_ = 0; a_ < args_.length; a_++) {
                        args_[a_] = uint256(
                            uint256(baseArgs_[a_] << step_)
                            >> 256 - stepSize_
                        );
                    }
                    (
                        uint256[4] memory mapCompiledSource_,
                        uint256[16] memory mapVals_
                    ) = compile(
                        mapSource_,
                        args_
                    );
                    uint256[32] memory mapStack_;
                    uint8 mapStackIndex_;
                    (mapStack_, mapStackIndex_) = eval(
                        context_,
                        mapStack_,
                        mapStackIndex_,
                        mapCompiledSource_,
                        mapVals_
                    );

                    for (uint256 m_ = 0; m_ < mapStackIndex_; m_++) {
                        stack_[stackIndex_ + m_] = mapStack_[m_];
                    }
                    stackIndex_ = stackIndex_ + mapStackIndex_;
                }
            }

            else if (opcode_ == OPCODE_BLOCK_NUMBER) {
                stack_[stackIndex_] = block.number;
                stackIndex_++;
            }

            else {
                (stack_, stackIndex_) = applyOpcode(
                    context_,
                    stack_,
                    stackIndex_,
                    opcode_,
                    operand_
                );
            }
        }

        return(stack_, stackIndex_);
    }

    function applyOpcode(
        bytes memory context_,
        uint256[32] memory stack_,
        uint8 stackIndex_,
        uint8 opcode_,
        uint8 operand_
    )
    internal
    virtual
    view
    // solhint-disable-next-line no-empty-blocks
    returns (uint256[32] memory, uint8) { }
}
