// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "rain.math.saturating/SaturatingMath.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";

/// @title OpSaturatingAdd
/// @notice Opcode for adding N numbers with saturating addition.
library OpSaturatingAdd {
    using LibOp for Pointer;
    using SaturatingMath for uint256;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.applyFnN(
                stackTop_,
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer stackTopAfter_) {
        return
            stackTop_.applyFnN(
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }
}
