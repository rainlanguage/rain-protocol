// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

uint256 constant OPCODE_MEMORY_TYPE_STACK = 0;
uint256 constant OPCODE_MEMORY_TYPE_CONSTANT = 1;
uint256 constant OPCODE_MEMORY_TYPE_CONTEXT = 2;

/// @title OpMemory
/// @notice Opcode for stacking from the state.
library OpMemory {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// Stack a value from the state.
    function memoryRead(
        VMState memory state_,
        uint256 operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            uint256 type_ = operand_ & 0x3;
            uint256 offset_ = operand_ >> 2;
            assembly ("memory-safe") {
                mstore(
                    stackTop_,
                    mload(
                        add(
                            mload(add(state_, mul(0x20, type_))),
                            mul(0x20, offset_)
                        )
                    )
                )
            }
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20);
        }
    }
}
