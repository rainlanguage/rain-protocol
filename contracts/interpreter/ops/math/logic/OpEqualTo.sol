// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";

/// @title OpEqualTo
/// @notice Opcode to compare the top two stack values.
library OpEqualTo {
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_, uint256 b_) internal pure returns (uint256 c_) {
        // Perhaps surprisingly it seems to require assembly to efficiently get
        // a `uint256` from boolean equality.
        assembly ("memory-safe") {
            c_ := eq(a_, b_)
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
