// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "../../../math/Binary.sol";

import "hardhat/console.sol";

uint256 constant OPCODE_MEMORY_TYPE_STACK = 0;
uint256 constant OPCODE_MEMORY_TYPE_CONSTANT = 1;

/// @title OpReadMemory
/// @notice Opcode for stacking from the state.
library OpReadMemory {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 type_ = Operand.unwrap(operand_) & MASK_1BIT;
        uint256 offset_ = Operand.unwrap(operand_) >> 1;
        if (type_ == OPCODE_MEMORY_TYPE_STACK) {
            console.log("stack", StackTop.unwrap(stackTop_), offset_);
            require(
                offset_ < integrityState_.stackBottom.toIndex(stackTop_),
                "OOB_STACK_READ"
            );
        } else {
            console.log("constant", StackTop.unwrap(stackTop_), offset_);
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
        StackTop stackTop_
    ) internal pure returns (StackTop) {
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
            return StackTop.wrap(StackTop.unwrap(stackTop_) + 0x20);
        }
    }
}
