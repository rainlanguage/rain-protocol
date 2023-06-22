// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "rain.interpreter/lib/LibOp.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpIsZero
/// @notice Opcode for checking if the stack top is zero.
library OpIsZero {
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_) internal pure returns (uint256 b_) {
        assembly ("memory-safe") {
            b_ := iszero(a_)
        }
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
