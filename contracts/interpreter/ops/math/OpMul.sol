// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpMul
/// @notice Opcode for multiplying N numbers.
library OpMul {
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function _mul(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ * b_;
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return
            integrityCheckState_.applyFnN(
                stackTop_,
                _mul,
                Operand.unwrap(operand_)
            );
    }

    function mul(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer stackTopAfter_) {
        return stackTop_.applyFnN(_mul, Operand.unwrap(operand_));
    }
}
