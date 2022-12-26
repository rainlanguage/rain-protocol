// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpMod
/// @notice Opcode to mod N numbers.
library OpMod {
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function _mod(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ % b_;
    }

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return
            integrityState_.applyFnN(stackTop_, _mod, Operand.unwrap(operand_));
    }

    function mod(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer stackTopAfter_) {
        return stackTop_.applyFnN(_mod, Operand.unwrap(operand_));
    }
}
