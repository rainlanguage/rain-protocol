// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";

/// @title OpSub
/// @notice Opcode for subtracting N numbers.
library OpSub {
    using LibStackTop for StackTop;

    function sub(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop stackTopAfter_)
    {
        StackTop location_ = stackTop_.down(operand_);
        uint256 accumulator_ = location_.peekUp();
        stackTopAfter_ = location_.up();
        for (StackTop i_ = stackTopAfter_; i_.lt(stackTop_); i_ = i_.up()) {
            accumulator_ -= i_.peekUp();
        }
        location_.set(accumulator_);
    }
}
