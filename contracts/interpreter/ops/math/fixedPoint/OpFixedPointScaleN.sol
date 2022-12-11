// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpFixedPointScaleN
/// @notice Opcode for scaling a number to N fixed point.
library OpFixedPointScaleN {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _scaleN(
        Operand operand_,
        uint256 a_
    ) internal pure returns (uint256) {
        return a_.scaleN(Operand.unwrap(operand_));
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _scaleN);
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_scaleN, operand_);
    }
}
