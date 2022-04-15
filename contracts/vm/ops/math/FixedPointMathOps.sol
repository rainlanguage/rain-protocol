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
/// @dev Number of provided opcodes for `FixedPointMathOps`.
uint256 constant FIXED_POINT_MATH_OPS_LENGTH = 5;

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
        } else {
            return 0;
        }
    }

    function scale18Mul(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 a_;
        uint256 b_;
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTopLocation_)
        }
        uint256 c_ = a_.scale18(operand_).fixedPointMul(b_);
        assembly {
            mstore(location_, c_)
        }
        return stackTopLocation_;
    }

    function scale18Div(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 a_;
        uint256 b_;
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTopLocation_)
        }
        uint256 c_ = a_.scale18(operand_).fixedPointDiv(b_);
        assembly {
            mstore(location_, c_)
        }
        return stackTopLocation_;
    }

    function scale18(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 a_;
        assembly {
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
        }
        uint256 b_ = a_.scale18(operand_);
        assembly {
            mstore(location_, b_)
        }
        return stackTopLocation_;
    }

    function scaleN(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 a_;
        assembly {
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
        }
        uint256 b_ = a_.scaleN(operand_);
        assembly {
            mstore(location_, b_)
        }
        return stackTopLocation_;
    }

    function scaleBy(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 a_;
        assembly {
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
        }
        uint256 b_ = a_.scaleBy(int8(uint8(operand_)));
        assembly {
            mstore(location_, b_)
        }
        return stackTopLocation_;
    }
}
