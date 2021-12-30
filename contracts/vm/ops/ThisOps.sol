// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "../RainVM.sol";

/// @title ThisOps
/// @notice RainVM opcode pack to access the current contract address.
library ThisOps {

    /// Opcode for this contract address.
    uint constant public THIS_ADDRESS = 0;
    /// Number of provided opcodes for `ThisOps`.
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
            // Put the current contract address on the stack.
            if (opcode_ == THIS_ADDRESS) {
                state_.stack[state_.stackIndex]
                    = uint256(uint160(address(this)));
                state_.stackIndex++;
            }
        }
    }

}