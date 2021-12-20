// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "hardhat/console.sol";

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
        State memory state_,
        uint config_
    ) internal view {
        unchecked {
            uint sourceIndex_;
            uint stepSize_;
            uint offset_;
            uint valLength_;
            assembly {
                sourceIndex_ := and(config_, 0x03)
                stepSize_ := shr(and(shr(2, config_), 0x07), 256)
                offset_ := sub(256, stepSize_)
                valLength_ := add(and(shr(5, config_), 0x07), 1)
            }
            state_.stackIndex -= valLength_;

            uint256[] memory baseVals_ = new uint256[](valLength_);
            for (uint256 a_ = 0; a_ < baseVals_.length; a_++) {
                baseVals_[a_] = state_.stack[state_.stackIndex + a_];
            }

            for (uint256 step_ = 0; step_ < 256; step_ += stepSize_) {
                for (uint256 a_ = 0; a_ < valLength_; a_++) {
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
            uint256 i_;
            uint256 opcode_;
            uint256 opval_;
            uint256 valIndex_;
            bool fromArguments_;
            i_ = source_.length;
            // Loop until 0.
            // It is up to the rain script to not underflow by calling `skip`
            // with a value larger than the remaining source.
            while (i_ > 0) {
                assembly {
                    let op_ := mload(add(source_, i_))
                    opcode_ := and(op_, 0xFF)
                    opval_ := and(shr(8, op_), 0xFF)
                    i_ := sub(i_, 0x2)
                }

                // console.log("op: %s %s", opcode_, opval_);

                if (opcode_ < 3) {
                    if (opcode_ == 0) {
                        assembly { i_ := sub(i_, mul(opval_, 2)) }
                        continue;
                    }
                    else if (opcode_ == 1) {
                        assembly {
                            valIndex_ := and(opval_, 0x7F)
                            fromArguments_ := gt(shr(7, opval_), 0)
                        }
                        state_.stack[state_.stackIndex] = fromArguments_
                            ? state_.arguments[valIndex_]
                            : state_.constants[valIndex_];
                        state_.stackIndex++;
                    }
                    else if (opcode_ == 2) {
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
