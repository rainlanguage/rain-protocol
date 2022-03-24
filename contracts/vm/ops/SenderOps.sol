// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @dev Opcode for the `msg.sender`.
uint256 constant OPCODE_SENDER = 0;
/// @dev Number of provided opcodes for `BlockOps`.
uint256 constant SENDER_OPS_LENGTH = 1;

/// @title BlockOps
/// @notice RainVM opcode pack to access the current block number.
library SenderOps {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < SENDER_OPS_LENGTH, "MAX_OPCODE");
            // There's only one opcode.
            // Stack the current `block.number`.
            state_.stack[state_.stackIndex] = uint256(uint160(msg.sender));
            state_.stackIndex++;
        }
    }
}
