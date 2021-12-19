// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "hardhat/console.sol";

struct Source {
    bytes source;
    uint8 stackSize;
    uint256[] constants;
    uint256[] arguments;
}

struct CallSize {
    uint8 fnSize;
    uint8 loopSize;
    uint8 valSize;
}

struct Stack {
    uint256[] vals;
    uint8 index;
}

struct Op {
    uint8 code;
    uint8 val;
}

enum Ops {
    skip,
    val,
    zipmap,
    length
}

abstract contract RainVM {

    /// Separate function to avoid blowing solidity compile time stack.
    function zipmap(
        bytes memory context_,
        Source memory source_,
        Stack memory stack_,
        CallSize memory callSize_
    ) internal view {
        unchecked {
            uint256 fnIndex_ = stack_.index - 1;
            stack_.index -= (callSize_.fnSize + callSize_.valSize + 2);

            bytes memory mapSource_ = new bytes((callSize_.fnSize + 1) * 32);

            for (uint256 f_ = 0; f_ < callSize_.fnSize + 1; f_++) {
                uint256 offset_ = 32 + (32 * f_);
                uint256 fnVal_ = stack_.vals[fnIndex_ - f_];
                assembly {
                    mstore(add(mapSource_, offset_), fnVal_)
                }
            }

            uint256[] memory baseVals_ = new uint256[](callSize_.valSize + 1);
            for (uint256 a_ = 0; a_ < baseVals_.length; a_++) {
                baseVals_[a_] = stack_.vals[stack_.index + a_];
            }

            uint256 stepSize_ = 256 >> callSize_.loopSize;

            for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
                uint256[] memory arguments_ = new uint256[](
                    baseVals_.length * 256 / stepSize_
                );
                for (uint256 a_ = 0; a_ < baseVals_.length; a_++) {
                    arguments_[a_] = uint256(
                        uint256(baseVals_[a_] << 256 - step_ - stepSize_)
                        >> 256 - stepSize_
                    );
                }
                Source memory evalSource_ = Source(
                    mapSource_,
                    source_.stackSize,
                    source_.constants,
                    arguments_
                );
                eval(
                    context_,
                    evalSource_,
                    stack_
                );
            }
        }
    }

    function eval(
        bytes memory context_,
        Source memory source_,
        Stack memory stack_
    ) internal view {
        unchecked {
            // Op memory op_;
            // less gas to read this once.
            uint256 i_;
            uint256 opcode_;
            uint256 opval_;
            uint256 sourceLength_ = source_.source.length;
            i_ = sourceLength_;
            bytes memory sourceBytes_ = source_.source;
            // loop until underflow.
            while (i_ > 0) {
                // console.log(i_);
                assembly {
                    let op_ := mload(add(sourceBytes_, i_))
                    opcode_ := and(op_, 0xFF)
                    opval_ := and(shr(8, op_), 0xFF)
                    i_ := sub(i_, 0x2)
                }
                // i_ -= 2;
                // console.log(opcode_);
                // op_.code = uint8(opcode_);
                // op_.val = uint8(opcode_ >> 8);

                // console.log("op: %s %s", opcode_, opval_);

                if (opcode_ < 3) {
                    if (opcode_ == 0) {
                        assembly {
                            i_ := sub(i_, mul(opval_, 2))
                        }
                        continue;
                    }
                    else if (opcode_ == 1) {
                        uint8 valIndex_ = uint8(opval_) & 0x7F;
                        bool fromArguments_ = (opval_ >> 7) > 0;
                        stack_.vals[stack_.index] = fromArguments_
                            ? source_.arguments[valIndex_]
                            : source_.constants[valIndex_];
                        stack_.index++;
                    }
                    else if (opcode_ == 2) {
                        // stack_ modified by reference.
                        zipmap(
                            context_,
                            source_,
                            stack_,
                            CallSize(
                                uint8(opval_) & 0x03,
                                (uint8(opval_) >> 2) & 0x07,
                                (uint8(opval_) >> 5) & 0x07
                            )
                        );
                    }
                }
                else {
                    // stack_ modified by reference.
                    applyOp(
                        context_,
                        stack_,
                        Op(uint8(opcode_), uint8(opval_))
                    );
                }
            }
        }
    }

    /// Stack is modified by reference NOT returned.
    /// Ops is ALSO modified by reference to calculate offsets, and discarded
    /// by eval for each dispatch.
    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    { } //solhint-disable-line no-empty-blocks
}
