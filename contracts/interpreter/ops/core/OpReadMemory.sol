// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "../../../math/Binary.sol";

uint256 constant OPCODE_MEMORY_TYPE_STACK = 0;
uint256 constant OPCODE_MEMORY_TYPE_CONSTANT = 1;

/// @title OpReadMemory
/// @notice Opcode for stacking from the state.
library OpReadMemory {
    using LibStackPointer for StackPointer;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        uint256 type_ = Operand.unwrap(operand_) & MASK_1BIT;
        uint256 offset_ = Operand.unwrap(operand_) >> 1;
        if (type_ == OPCODE_MEMORY_TYPE_STACK) {
            require(
                offset_ < integrityState_.stackBottom.toIndex(stackTop_),
                "OOB_STACK_READ"
            );
        } else {
            require(
                offset_ < integrityState_.constantsLength,
                "OOB_CONSTANT_READ"
            );
        }
        return integrityState_.push(stackTop_);
    }

    function run(
        InterpreterState memory state_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        unchecked {
            uint256 type_ = Operand.unwrap(operand_) & MASK_1BIT;
            uint256 offset_ = Operand.unwrap(operand_) >> 1;
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
            return StackPointer.wrap(StackPointer.unwrap(stackTop_) + 0x20);
        }
    }
}
