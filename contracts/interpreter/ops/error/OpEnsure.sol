// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "rain.interpreter/lib/LibOp.sol";
import "../../deploy/LibIntegrityCheck.sol";

error ExpressionError(
    bytes[] compiledSources,
    uint256[] constants,
    uint256[][] context,
    uint256[] stack,
    uint256 stackTopIndex,
    uint256[] kvs,
    FullyQualifiedNamespace namespace,
    IInterpreterStoreV1 store,
    Operand operand
);

/// @title OpEnsure
/// @notice Opcode for requiring some truthy values.
library OpEnsure {
    using LibPointer for Pointer;
    using LibUint256Array for Pointer;
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibMemoryKV for MemoryKV;

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
            revert ExpressionError(
                state_.compiledSources,
                state_.constantsBottom.unsafeSubWord().unsafeAsUint256Array(),
                state_.context,
                state_.stackBottom.unsafeSubWord().unsafeAsUint256Array(),
                state_.stackBottom.unsafeToIndex(stackTop_),
                state_.stateKV.toUint256Array(),
                state_.namespace,
                state_.store,
                operand_
            );
        }
        return stackTop_;
    }
}
