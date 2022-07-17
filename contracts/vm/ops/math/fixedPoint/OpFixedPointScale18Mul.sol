// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";

/// @title OpFixedPointScale18Mul
/// @notice Opcode for performing scale 18 fixed point multiplication.
library OpFixedPointScale18Mul {
    using FixedPointMath for uint256;

    function scale18Mul(uint256 operand_, StackTop stackTopLocation_)
        internal
        pure
        returns (StackTop)
    {
        uint256 location_;
        uint256 a_;
        uint256 b_;
        assembly ("memory-safe") {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
            b_ := mload(stackTopLocation_)
        }
        uint256 c_ = a_.scale18(operand_).fixedPointMul(b_);
        assembly ("memory-safe") {
            mstore(location_, c_)
        }
        return stackTopLocation_;
    }
}
