// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpTimestamp
/// @notice Opcode for getting the current timestamp.
library OpTimestamp {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.push(stackTop_);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.unsafePush(block.timestamp);
    }
}
