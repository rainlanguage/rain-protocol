// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

struct State {
    bytes[] sources;
    uint[] constants;
    uint[] arguments;
    uint[] stack;
    uint stackIndex;
}

struct Op {
    uint code;
    uint val;
}

abstract contract RainVM {

    uint constant internal OP_SKIP = 0;
    uint constant internal OP_VAL = 1;
    uint constant internal OP_ZIPMAP = 2;
    uint constant internal OPS_LENGTH = 3;

    /// Separate function to avoid blowing solidity compile time stack.
    function zipmap(
        bytes memory context_,
        State memory state_,
        uint config_
    ) internal view {
        unchecked {
            uint sourceIndex_;
            uint stepSize_;
            uint offset_;
            uint valLength_;
            // assembly here to shave some gas.
            assembly {
                // rightmost 2 bits are the index of the source to use from
                // sources in `state_`.
                sourceIndex_ := and(config_, 0x03)
                // bits 2-5 indicate size of the loop. Each 1 increment of the
                // size halves the bits of the arguments to the zipmap.
                // e.g. 256 `stepSize_` would copy all 256 bits of the uint256
                // into args for the inner `eval`. A loop size of `1` would
                // shift `stepSize_` by 1 (halving it) and meaning the uint256
                // is `eval` as 2x 128 bit values (runs twice). A loop size of
                // `2` would run 4 times as 64 bit values, and so on.
                //
                // Slither false positive here for the shift of constant `256`.
                // slither-disable-next-line incorrect-shift
                stepSize_ := shr(and(shr(2, config_), 0x07), 256)
                // `offset_` is used by the actual bit shifting operations and
                // is precalculated here to save some gas as this is a hot
                // performance path.
                offset_ := sub(256, stepSize_)
                // bits 5+ determine the number of vals to be zipped. At least
                // one value must be provided so a `valLength_` of `0` is one
                // value to loop over.
                valLength_ := add(shr(5, config_), 1)
            }
            state_.stackIndex -= valLength_;

            uint[] memory baseVals_ = new uint[](valLength_);
            for (uint a_ = 0; a_ < baseVals_.length; a_++) {
                baseVals_[a_] = state_.stack[state_.stackIndex + a_];
            }

            for (uint step_ = 0; step_ < 256; step_ += stepSize_) {
                for (uint a_ = 0; a_ < valLength_; a_++) {
                    state_.arguments[a_]
                        = (baseVals_[a_] << offset_ - step_) >> offset_;
                }
                eval(
                    context_,
                    state_,
                    sourceIndex_
                );
            }
        }
    }

    function eval(
        bytes memory context_,
        State memory state_,
        uint sourceIndex_
    ) internal view {
        unchecked {
            // Op memory op_;
            // less gas to read this once.
            bytes memory source_ = state_.sources[sourceIndex_];
            uint i_;
            uint opcode_;
            uint opval_;
            uint valIndex_;
            bool fromArguments_;
            i_ = source_.length;
            // Loop until 0.
            // It is up to the rain script to not underflow by calling `skip`
            // with a value larger than the remaining source.
            while (i_ > 0) {
                assembly {
                    // mload taking 32 bytes and source_ starts with 32 byte
                    // length, so i_ offset moves the end of the loaded bytes
                    // to the op we want.
                    let op_ := mload(add(source_, i_))
                    opcode_ := and(op_, 0xFF)
                    opval_ := and(shr(8, op_), 0xFF)
                    i_ := sub(i_, 0x2)
                }

                if (opcode_ < OPS_LENGTH) {
                    if (opcode_ == OP_SKIP) {
                        assembly { i_ := sub(i_, mul(opval_, 2)) }
                        continue;
                    }
                    else if (opcode_ == OP_VAL) {
                        assembly {
                            valIndex_ := and(opval_, 0x7F)
                            fromArguments_ := gt(shr(7, opval_), 0)
                        }
                        state_.stack[state_.stackIndex] = fromArguments_
                            ? state_.arguments[valIndex_]
                            : state_.constants[valIndex_];
                        state_.stackIndex++;
                    }
                    else if (opcode_ == OP_ZIPMAP) {
                        // state_ modified by reference.
                        zipmap(
                            context_,
                            state_,
                            opval_
                        );
                    }
                }
                else {
                    // state_ modified by reference.
                    applyOp(
                        context_,
                        state_,
                        Op(opcode_, opval_)
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
        State memory state_,
        Op memory op_
    )
    internal
    virtual
    view
    { } //solhint-disable-line no-empty-blocks
}
