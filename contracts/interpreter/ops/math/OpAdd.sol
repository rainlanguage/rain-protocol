// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackPointer.sol";
import "../../../array/LibUint256Array.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpAdd
/// @notice Opcode for adding N numbers.
library OpAdd {
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function _add(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return
            integrityState_.applyFnN(stackTop_, _add, Operand.unwrap(operand_));
    }

    function add(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return stackTop_.applyFnN(_add, Operand.unwrap(operand_));
    }
}
