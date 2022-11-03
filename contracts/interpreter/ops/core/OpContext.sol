// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "../../../idempotent/LibIdempotentFlag.sol";

/// @title OpContext
/// @notice Opcode for stacking from the context. Context requires slightly
/// different handling to `OpState` memory reads as it is working with data that
/// is provided at runtime.
library OpContext {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    /// Interpreter integrity logic.
    /// Context pushes a single value to the stack from memory.
    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        uint256 column_ = Operand.unwrap(operand_) >> 8;
        uint256 row_ = Operand.unwrap(operand_) & uint256(type(uint8).max);
        integrityState_.contextScratch = IdempotentFlag.unwrap(
            LibIdempotentFlag.set16x16(
                IdempotentFlag.wrap(integrityState_.contextScratch),
                column_,
                row_
            )
        );
        // Note that a expression with context can error at runtime due to OOB
        // reads that we don't know about here.
        return integrityState_.push(stackTop_);
    }

    /// Stack a value from the context WITH OOB checks from solidity.
    /// The bounds checks are done at runtime because context MAY be provided
    /// by the end user with arbitrary length.
    function context(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        // The indexing syntax here enforces OOB checks at runtime.
        return
            stackTop_.push(
                state_.context[Operand.unwrap(operand_) >> 8][
                    Operand.unwrap(operand_) & uint256(type(uint8).max)
                ]
            );
    }
}
