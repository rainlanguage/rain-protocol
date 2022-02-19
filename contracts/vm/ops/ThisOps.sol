// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

/// @title ThisOps
/// @notice RainVM opcode pack to access the current contract address.
library ThisOps {
    /// Number of provided opcodes for `ThisOps`.
    uint256 internal constant OPS_LENGTH = 1;

    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256,
        uint256
    ) internal view returns (uint256) {
        unchecked {
            // There's only one opcode.
            // Put the current contract address on the stack.
            assembly {
                mstore(stackTopLocation_, address())
                stackTopLocation_ := add(stackTopLocation_, 0x20)
            }
            return stackTopLocation_;
        }
    }
}
