// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "../RainVM.sol";

/// @title BlockOps
/// @notice RainVM opcode pack to access the current block number.
library BlockOps {

    /// Opcode for the block number.
    uint constant public BLOCK_NUMBER = 0;
    /// Number of provided opcodes for `BlockOps`.
    uint constant public OPS_LENGTH = 1;

    function applyOp(
        bytes memory,
        State memory state_,
        uint opcode_,
        uint
    )
    internal
    view
    {
        unchecked {
            // Stack the current `block.number`.
            if (opcode_ == BLOCK_NUMBER) {
                state_.stack[state_.stackIndex] = block.number;
                state_.stackIndex++;
            }
        }
    }

}