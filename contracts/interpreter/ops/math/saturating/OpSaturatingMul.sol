// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../run/LibStackPointer.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpSaturatingMul
/// @notice Opcode for multiplying N numbers with saturating multiplication.
library OpSaturatingMul {
    using SaturatingMath for uint256;
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return
            integrityState_.applyFnN(
                stackTop_,
                SaturatingMath.saturatingMul,
                Operand.unwrap(operand_)
            );
    }

    function saturatingMul(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer stackTopAfter_) {
        return
            stackTop_.applyFnN(
                SaturatingMath.saturatingMul,
                Operand.unwrap(operand_)
            );
    }
}
