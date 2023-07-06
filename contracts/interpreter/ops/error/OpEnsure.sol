// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "../../deploy/LibIntegrityCheck.sol";

error ExpressionError(
    InterpreterState state,
    Operand operand,
    Pointer stackTop
);

/// @title OpEnsure
/// @notice Opcode for requiring some truthy values.
library OpEnsure {
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.pop(stackTop_);
    }

    function run(
        InterpreterState memory state_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        uint256 a_;
        (stackTop_, a_) = stackTop_.unsafePop();
        if (a_ == 0) {
            revert ExpressionError(state_, operand_, stackTop_);
        }
        return stackTop_;
    }
}
