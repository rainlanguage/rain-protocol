// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

/// @title BlockOps
/// @notice RainVM opcode pack to access the current block number.
library BlockOps {
    /// Opcode for the block number.
    uint256 private constant BLOCK_NUMBER = 0;
    /// Opcode for the block timestamp.
    uint256 private constant BLOCK_TIMESTAMP = 1;
    /// Number of provided opcodes for `BlockOps`.
    uint256 internal constant OPS_LENGTH = 2;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
            // Stack the current `block.number`.
            if (opcode_ == BLOCK_NUMBER) {
                state_.stack[state_.stackIndex] = block.number;
                state_.stackIndex++;
            }
            // Stack the current `block.timestamp`.
            else if (opcode_ == BLOCK_TIMESTAMP) {
                // solhint-disable-next-line not-rely-on-time
                state_.stack[state_.stackIndex] = block.timestamp;
                state_.stackIndex++;
            }
        }
    }
}
