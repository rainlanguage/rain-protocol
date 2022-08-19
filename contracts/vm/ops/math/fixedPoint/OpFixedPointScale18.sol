// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";

/// @title OpFixedPointScale18
/// @notice Opcode for scaling a number to 18 fixed point.
library OpFixedPointScale18 {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;

    function scale18(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        (StackTop location_, uint256 a_) = stackTop_.peek();
        location_.set(a_.scale18(operand_));
        return stackTop_;
    }
}
