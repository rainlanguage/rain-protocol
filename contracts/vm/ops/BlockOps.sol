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

    function stackIndexDiff(uint256, uint256) internal pure returns (int256) {
        return 1;
    }

    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256
    ) internal view returns (uint256) {
        unchecked {
            assembly {
                switch opcode_
                // BLOCK_NUMBER
                case 0 {
                    mstore(stackTopLocation_, number())
                }
                // BLOCK_TIMESTAMP
                case 1 {
                    mstore(stackTopLocation_, timestamp())
                }
                stackTopLocation_ := add(stackTopLocation_, 0x20)
            }
            return stackTopLocation_;
        }
    }
}
