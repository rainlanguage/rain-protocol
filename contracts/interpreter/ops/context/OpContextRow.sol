// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.solmem/lib/LibPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";

/// @title OpContextRow
/// @notice Opcode for stacking a dynamic row from the context. Context requires
/// slightly different handling to other memory reads as it is working with data
/// that is provided at runtime. `OpContextRow` works exactly like `OpContext`
/// but the row is provided from the stack instead of the operand. We rely on
/// Solidity OOB checks at runtime to enforce that the index from the stack is
/// within bounds at runtime. As we do NOT know statically which row will be read
/// the context reads is set to the entire column.
library OpContextRow {
    using LibPointer for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    /// Interpreter integrity logic.
    /// Context pushes a single value to the stack from memory.
    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        // Note that a expression with context can error at runtime due to OOB
        // reads that we don't know about here.
        function(uint256) internal pure returns (uint256) fn_;
        return integrityCheckState_.applyFn(stackTop_, fn_);
    }

    /// Stack a value from the context WITH OOB checks from solidity.
    /// The bounds checks are done at runtime because context MAY be provided
    /// by the end user with arbitrary length.
    function run(
        InterpreterState memory state_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        // The indexing syntax here enforces OOB checks at runtime.
        (Pointer location_, uint256 row_) = stackTop_.unsafePop();
        location_.unsafeWriteWord(
            state_.context[Operand.unwrap(operand_)][row_]
        );
        return stackTop_;
    }
}
