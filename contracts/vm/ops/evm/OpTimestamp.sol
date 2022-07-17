// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";

/// @title OpTimestamp
/// @notice Opcode for getting the current timestamp.
library OpTimestamp {
    using LibStackTop for StackTop;

    function timestamp(uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return stackTop_.push(block.timestamp);
    }
}
