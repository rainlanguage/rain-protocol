// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @dev Opcode for this contract address.
uint256 constant OPCODE_THIS_ADDRESS = 0;
/// @dev Number of provided opcodes for `ThisOps`.
uint256 constant THIS_OPS_LENGTH = 1;

/// @title ThisOps
/// @notice RainVM opcode pack to access the current contract address.
library ThisOps {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < THIS_OPS_LENGTH, "MAX_OPCODE");
            // There's only one opcode.
            // Put the current contract address on the stack.
            state_.stack[state_.stackIndex] = uint256(uint160(address(this)));
            state_.stackIndex++;
        }
    }
}
