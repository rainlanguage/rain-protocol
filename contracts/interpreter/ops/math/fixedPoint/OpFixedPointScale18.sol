// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/LibFixedPointMath.sol";
import "../../../run/LibStackPointer.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// Thrown when the number of inputs aren't supported.
/// @param inputs The number of inputs that were provided.
error UnsupportedInputsFixedPointScale18(uint256 inputs);

/// @title OpFixedPointScale18
/// @notice Opcode for scaling a number to 18 decimal fixed point.
library OpFixedPointScale18 {
    using LibFixedPointMath for uint256;
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function fStaticScale(
        Operand operand_,
        uint256 a_
    ) internal pure returns (uint256) {
        return
            a_.scale18(
                Operand.unwrap(operand_) >> 3,
                Math.Rounding((Operand.unwrap(operand_) >> 2) & MASK_1BIT)
            );
    }

    function fDynamicScale(
        Operand operand_,
        uint256 scale_,
        uint256 a_
    ) internal pure returns (uint256) {
        return
            a_.scale18(
                scale_,
                Math.Rounding((Operand.unwrap(operand_) >> 2) & MASK_1BIT)
            );
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        uint256 inputs_ = Operand.unwrap(operand_) & MASK_2BIT;
        if (inputs_ == 1) {
            return integrityCheckState_.applyFn(stackTop_, fStaticScale);
        } else if (inputs_ == 2) {
            return integrityCheckState_.applyFn(stackTop_, fDynamicScale);
        } else {
            revert UnsupportedInputsFixedPointScale18(inputs_);
        }
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        uint256 inputs_ = Operand.unwrap(operand_) & MASK_2BIT;
        if (inputs_ == 1) {
            return stackTop_.applyFn(fStaticScale, operand_);
        } else {
            return stackTop_.applyFn(fDynamicScale, operand_);
        }
    }
}
