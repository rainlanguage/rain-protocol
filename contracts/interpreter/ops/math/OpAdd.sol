// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.solmem/lib/LibStackPointer.sol";
import "rain.solmem/lib/LibUint256Array.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";

/// @title OpAdd
/// @notice Opcode for adding N numbers with error on overflow.
library OpAdd {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    /// Addition with implied overflow checks from the Solidity 0.8.x compiler.
    function f(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.applyFnN(
                stackTop_,
                f,
                Operand.unwrap(operand_)
            );
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFnN(f, Operand.unwrap(operand_));
    }
}
