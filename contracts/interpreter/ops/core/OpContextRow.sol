// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "../../../idempotent/LibIdempotentFlag.sol";
import "../../../math/Binary.sol";

/// @title OpContextRow
/// @notice Opcode for stacking a dynamic row from the context. Context requires
/// slightly different handling to other memory reads as it is working with data
/// that is provided at runtime. `OpContextRow` works exactly like `OpContext`
/// but the row is provided from the stack instead of the operand. We rely on
/// Solidity OOB checks at runtime to enforce that the index from the stack is
/// within bounds at runtime. As we do NOT know statically which row will be read
/// the contextReadss is set to the entire column.
library OpContextRow {
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
        uint256 column_ = Operand.unwrap(operand_);
        integrityState_.contextReads = IdempotentFlag.unwrap(
            LibIdempotentFlag.set16x16Column(
                IdempotentFlag.wrap(integrityState_.contextReads),
                column_
            )
        );
        // Note that a expression with context can error at runtime due to OOB
        // reads that we don't know about here.
        function(uint) internal pure returns (uint) fn_;
        return integrityState_.applyFn(stackTop_, fn_);
    }

    /// Stack a value from the context WITH OOB checks from solidity.
    /// The bounds checks are done at runtime because context MAY be provided
    /// by the end user with arbitrary length.
    function run(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        // The indexing syntax here enforces OOB checks at runtime.
        (StackTop location_, uint row_) = stackTop_.pop();
        location_.set(state_.context[Operand.unwrap(operand_)][row_]);
        return stackTop_;
    }
}
