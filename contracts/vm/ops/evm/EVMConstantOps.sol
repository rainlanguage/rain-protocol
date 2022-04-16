// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

import "hardhat/console.sol";

/// @dev Opcode for the block number.
uint256 constant OPCODE_BLOCK_NUMBER = 0;
/// @dev Opcode for the block timestamp.
uint256 constant OPCODE_BLOCK_TIMESTAMP = 1;
/// @dev Opcode for the `caller`.
uint256 constant OPCODE_CALLER = 2;
/// @dev Opcode for address of the current contract.
uint256 constant OPCODE_THIS_ADDRESS = 3;
/// @dev Number of provided opcodes for `BlockOps`.
uint256 constant EVM_CONSTANT_OPS_LENGTH = 4;

/// @title EVMConstantOps
/// @notice RainVM opcode pack to access constants from the EVM environment.
library EVMConstantOps {
    function stackIndexDiff(uint256, uint256) internal pure returns (int256) {
        return 1;
    }

    function number(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        assembly {
            mstore(stackTopLocation_, number())
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }

    function timestamp(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        assembly {
            mstore(stackTopLocation_, timestamp())
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }

    function caller(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        assembly {
            mstore(stackTopLocation_, caller())
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }

    function thisAddress(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        assembly {
            mstore(stackTopLocation_, address())
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }
}
