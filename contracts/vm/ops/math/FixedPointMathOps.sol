// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";
import "../../../math/FixedPointMath.sol";

/// @dev Opcode for multiplication.
uint256 constant OPCODE_SCALE18_MUL = 0;
/// @dev Opcode for division.
uint256 constant OPCODE_SCALE18_DIV = 1;
/// @dev Opcode to rescale some fixed point number to 18 OOMs in situ.
uint256 constant OPCODE_SCALE18 = 2;
/// @dev Opcode to rescale an 18 OOMs fixed point number to scale N.
uint256 constant OPCODE_SCALEN = 3;
/// @dev Opcode to rescale an arbitrary fixed point number by some OOMs.
uint256 constant OPCODE_SCALE_BY = 4;
/// @dev Opcode for stacking the definition of one.
uint256 constant OPCODE_ONE = 5;
/// @dev Opcode for stacking number of fixed point decimals used.
uint256 constant OPCODE_DECIMALS = 6;
/// @dev Number of provided opcodes for `FixedPointMathOps`.
uint256 constant FIXED_POINT_MATH_OPS_LENGTH = 7;

/// @title FixedPointMathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library FixedPointMathOps {
    using FixedPointMath for uint256;

    function stackIndexDiff(uint256 opcode_, uint256)
        internal
        pure
        returns (int256)
    {
        if (opcode_ < OPCODE_SCALE18) {
            return -1;
        } else if (opcode_ < OPCODE_ONE) {
            return 0;
        } else {
            return 1;
        }
    }

    function applyOp(
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure returns (uint256) {
        unchecked {
            if (opcode_ < OPCODE_SCALE18) {
                uint256 aLocation_;
                uint256 bLocation_;
                uint256 a_;
                uint256 b_;
                uint256 c_;
                assembly {
                    aLocation_ := sub(stackTopLocation_, 0x40)
                    bLocation_ := sub(stackTopLocation_, 0x20)
                    a_ := mload(aLocation_)
                    b_ := mload(bLocation_)
                }
                if (opcode_ == OPCODE_SCALE18_MUL) {
                    c_ = a_.scale18(operand_).fixedPointMul(b_);
                } else {
                    c_ = a_.scale18(operand_).fixedPointDiv(b_);
                }
                assembly {
                    mstore(aLocation_, c_)
                }
                return bLocation_;
            } else if (opcode_ < OPCODE_ONE) {
                uint256 location_;
                uint256 a_;
                uint256 b_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x20)
                    a_ := mload(location_)
                }
                if (opcode_ == OPCODE_SCALE18) {
                    b_ = a_.scale18(operand_);
                } else if (opcode_ == OPCODE_SCALEN) {
                    b_ = a_.scaleN(operand_);
                } else {
                    b_ = a_.scaleBy(int8(uint8(operand_)));
                }
                assembly {
                    mstore(location_, b_)
                }
                return stackTopLocation_;
            } else {
                uint256 a_;
                if (opcode_ == OPCODE_ONE) {
                    a_ = FP_ONE;
                } else {
                    a_ = FP_DECIMALS;
                }
                assembly {
                    mstore(stackTopLocation_, a_)
                }
                return stackTopLocation_ + 0x20;
            }
        }
    }
}
