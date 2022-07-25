// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpMin
/// @notice Opcode to stack the minimum of N numbers.
library OpMin {
    using LibStackTop for StackTop;

    function min(VMState memory, uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop stackTopAfter_)
    {
        StackTop location_ = stackTop_.down(operand_);
        uint256 accumulator_ = location_.peekUp();
        stackTopAfter_ = location_.up();
        for (StackTop i_ = stackTopAfter_; i_.lt(stackTop_); i_ = i_.up()) {
            uint256 item_ = i_.peekUp();
            if (item_ < accumulator_) {
                accumulator_ = item_;
            }
        }
        location_.set(accumulator_);
    }
}
