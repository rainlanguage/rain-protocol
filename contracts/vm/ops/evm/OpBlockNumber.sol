// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";

/// @title OpBlockNumber
/// @notice Opcode for getting the current block number.
library OpBlockNumber {
    using LibStackTop for StackTop;

    uint256 public constant POPS = 0;
    uint256 public constant PUSHES = 1;

    function blockNumber(uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        return stackTop_.push(block.number);
    }
}
