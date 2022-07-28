// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";

/// @title OpEvery
/// @notice Opcode to compare the top N stack values.
library OpEvery {
    using LibStackTop for StackTop;

    // EVERY
    // EVERY is either the first item if every item is nonzero, else 0.
    // operand_ is the length of items to check.
    function every(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        StackTop location_ = stackTop_.down(operand_);
        for (StackTop i_ = location_; i_.lt(stackTop_); i_ = i_.up()) {
            if (i_.peekUp() == 0) {
                return location_.push(0);
            }
        }
        return location_.up();
    }
}
