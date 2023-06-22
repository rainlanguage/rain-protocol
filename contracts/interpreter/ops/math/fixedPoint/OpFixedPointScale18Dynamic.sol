// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "rain.math.fixedpoint/FixedPointDecimalScale.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibOp.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "sol.lib.binmaskflag/Binary.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpFixedPointScale18Dynamic
/// @notice Opcode for scaling a number to 18 decimal fixed point. Identical to
/// `OpFixedPointScale18` but the scale value is taken from the stack instead of
/// the operand.
library OpFixedPointScale18Dynamic {
    using FixedPointDecimalScale for uint256;
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        Operand operand_,
        uint256 scale_,
        uint256 a_
    ) internal pure returns (uint256) {
        return a_.scale18(scale_, Operand.unwrap(operand_) & MASK_2BIT);
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
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f, operand_);
    }
}
