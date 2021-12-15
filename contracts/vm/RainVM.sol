// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

struct Source {
    uint256[] source;
    uint256[] constants;
    uint256[] arguments;
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

enum Ops {
    skip,
    val,
    zipmap,
    length
}

abstract contract RainVM {

    // 32 bytes * 4 items.
    uint8 public constant MAX_SOURCE_LENGTH = 128;

    /// Separate function to avoid blowing solidity compile time stack.
    function zipmap(
        bytes memory context_,
        Source memory source_,
        Stack memory stack_,
        CallSize memory callSize_
    ) internal view {
        uint256 fnIndex_ = stack_.index - 1;
        stack_.index -= (callSize_.fnSize + callSize_.valSize + 2);

        uint256[] memory mapSource_ = new uint256[](callSize_.fnSize + 1);

        for (uint256 f_ = 0; f_ < mapSource_.length; f_++) {
            mapSource_[f_] = stack_.vals[fnIndex_ - f_];
        }

        uint256[] memory baseVals_ = new uint256[](callSize_.valSize + 1);
        for (uint256 a_ = 0; a_ < baseVals_.length; a_++) {
            baseVals_[a_] = stack_.vals[a_];
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
                source_.constants,
                arguments_
            );
            Stack memory evalStack_;
            // evalStack_ modified by reference.
            eval(
                context_,
                evalSource_,
                evalStack_
            );

            for (uint256 m_ = 0; m_ < evalStack_.index; m_++) {
                stack_.vals[stack_.index + m_] = evalStack_.vals[m_];
            }
            stack_.index = stack_.index + evalStack_.index;
        }
    }

    function eval(
        bytes memory context_,
        Source memory source_,
        Stack memory stack_
    ) internal view {
        for (
            uint256 i_ = source_.source.length * 32;
            i_ > 0;
            i_ = i_ - 2
        ) {
            SourceCursor memory sourceCursor_ = SourceCursor(
                uint8((i_ - 2) / 32),
                uint8((i_ - 2) % 32)
            );

            Op memory op_ = Op(
                uint8(
                    uint256(source_.source[sourceCursor_.item]
                        >> (256 - uint256(sourceCursor_.index + 2) * 8)
                    )
                ),
                uint8(
                    uint256(source_.source[sourceCursor_.item]
                        >> (256 - uint256(sourceCursor_.index + 1) * 8)
                    )
                )
            );

            if (op_.code < uint8(Ops.length)) {
                if (op_.code == uint8(Ops.skip)) {
                    i_ -= op_.val * 2;
                    continue;
                }
                else if (op_.code == uint8(Ops.val)) {
                    uint8 valIndex_ = op_.val & 0x7F;
                    bool fromArguments_ = (op_.val >> 7) > 0;
                    stack_.vals[stack_.index] = fromArguments_
                        ? source_.arguments[valIndex_]
                        : source_.constants[valIndex_];
                    stack_.index++;
                }
                else if (op_.code == uint8(Ops.zipmap)) {
                    // stack_ modified by reference.
                    zipmap(
                        context_,
                        source_,
                        stack_,
                        CallSize(
                            op_.val & 0x03,
                            (op_.val >> 2) & 0x07,
                            (op_.val >> 5) & 0x07
                        )
                    );
                }
            }
            else {
                // stack_ modified by reference.
                applyOp(
                    context_,
                    stack_,
                    op_
                );
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
