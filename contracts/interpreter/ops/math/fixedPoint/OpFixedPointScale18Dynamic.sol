// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/LibFixedPointMath.sol";
import "../../../run/LibStackPointer.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpFixedPointScale18Dynamic
/// @notice Opcode for scaling a number to 18 decimal fixed point. Identical to
/// `OpFixedPointScale18` but the scale value is taken from the stack instead of
/// the operand.
library OpFixedPointScale18Dynamic {
    using LibFixedPointMath for uint256;
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        Operand operand_,
        uint256 scale_,
        uint256 a_
    ) internal pure returns (uint256) {
        return
            a_.scale18(
                scale_,
                Math.Rounding(Operand.unwrap(operand_) & MASK_1BIT)
            );
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return stackTop_.applyFn(f, operand_);
    }
}
