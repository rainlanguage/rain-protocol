// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

/// @dev Opcode for the block number.
uint256 constant OPCODE_BLOCK_NUMBER = 0;
/// @dev Opcode for the block timestamp.
uint256 constant OPCODE_BLOCK_TIMESTAMP = 1;
/// @dev Opcode for the `caller`.
uint256 constant OPCODE_CALLER = 2;
/// @dev Opcode for address of the current contract.
uint256 constant OPCODE_ADDRESS = 3;
/// @dev Number of provided opcodes for `BlockOps`.
uint256 constant EVM_CONSTANT_OPS_LENGTH = 4;

/// @title EVMConstantOps
/// @notice RainVM opcode pack to access constants from the EVM environment.
library EVMConstantOps {

    function stackIndexDiff(uint256, uint256) internal pure returns (int256) {
        return 1;
    }

    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            assembly {
                switch opcode_
                // OPCODE_BLOCK_NUMBER
                case 0 {
                    mstore(stackTopLocation_, number())
                }
                // OPCODE_BLOCK_TIMESTAMP
                case 1 {
                    mstore(stackTopLocation_, timestamp())
                }
                // OPCODE_CALLER
                case 2 {
                    mstore(stackTopLocation_, caller())
                }
                // OPCODE_ADDRESS
                case 3 {
                    mstore(stackTopLocation_, address())
                }
            }
            return stackTopLocation_ + 0x20;
        }
    }
}
