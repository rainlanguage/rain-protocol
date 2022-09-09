// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../deploy/LibIntegrity.sol";

/// @title OpSaturatingMul
/// @notice Opcode for multiplying N numbers with saturating multiplication.
library OpSaturatingMul {
    using SaturatingMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
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
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return
            stackTop_.applyFnN(
                SaturatingMath.saturatingMul,
                Operand.unwrap(operand_)
            );
    }
}
