// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "rain.math.fixedpoint/FixedPointDecimalScale.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "sol.lib.binmaskflag/Binary.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";

/// @title OpFixedPointScale18
/// @notice Opcode for scaling a number to 18 decimal fixed point.
library OpFixedPointScale18 {
    using FixedPointDecimalScale for uint256;
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(Operand operand_, uint256 a_) internal pure returns (uint256) {
        return
            a_.scale18(
                Operand.unwrap(operand_) >> 2,
                Operand.unwrap(operand_) & MASK_2BIT
            );
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
