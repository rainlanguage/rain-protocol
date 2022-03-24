// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @dev Opcode for the block number.
uint256 constant OPCODE_BLOCK_NUMBER = 0;
/// @dev Opcode for the block timestamp.
uint256 constant OPCODE_BLOCK_TIMESTAMP = 1;
/// @dev Number of provided opcodes for `BlockOps`.
uint256 constant BLOCK_OPS_LENGTH = 2;

/// @title BlockOps
/// @notice RainVM opcode pack to access the current block number.
library BlockOps {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < BLOCK_OPS_LENGTH, "MAX_OPCODE");
            // Stack the current `block.number`.
            if (opcode_ == OPCODE_BLOCK_NUMBER) {
                state_.stack[state_.stackIndex] = block.number;
                state_.stackIndex++;
            }
            // Stack the current `block.timestamp`.
            else if (opcode_ == OPCODE_BLOCK_TIMESTAMP) {
                // solhint-disable-next-line not-rely-on-time
                state_.stack[state_.stackIndex] = block.timestamp;
                state_.stackIndex++;
            }
        }
    }
}
