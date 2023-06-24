// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";

/// @title OpContext
/// @notice Opcode for stacking from the context. Context requires slightly
/// different handling to other memory reads as it is working with data that
/// is provided at runtime from the calling contract on a per-eval basis so
/// cannot be predicted at deploy time.
library OpContext {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    /// Interpreter integrity logic.
    /// Context pushes a single value to the stack from the context array.
    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        // Note that a expression with context can error at runtime due to OOB
        // reads that we don't know about here.
        return integrityCheckState_.push(stackTop_);
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
        return
            stackTop_.unsafePush(
                state_.context[Operand.unwrap(operand_) >> 8][
                    Operand.unwrap(operand_) & MASK_8BIT
                ]
            );
    }
}
