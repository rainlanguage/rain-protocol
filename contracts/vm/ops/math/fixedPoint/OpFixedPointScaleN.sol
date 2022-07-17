// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";

/// @title OpFixedPointScaleN
/// @notice Opcode for scaling a number to N fixed point.
library OpFixedPointScaleN {
    using FixedPointMath for uint256;

    function scaleN(uint256 operand_, StackTop stackTopLocation_)
        internal
        pure
        returns (StackTop)
    {
        uint256 location_;
        uint256 a_;
        assembly ("memory-safe") {
            location_ := sub(stackTopLocation_, 0x20)
            a_ := mload(location_)
        }
        uint256 b_ = a_.scaleN(operand_);
        assembly ("memory-safe") {
            mstore(location_, b_)
        }
        return stackTopLocation_;
    }
}
