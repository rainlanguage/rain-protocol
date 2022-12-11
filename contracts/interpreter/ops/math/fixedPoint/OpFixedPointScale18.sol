// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpFixedPointScale18
/// @notice Opcode for scaling a number to 18 fixed point.
library OpFixedPointScale18 {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _scale18(
        Operand operand_,
        uint256 a_
    ) internal pure returns (uint256) {
        return a_.scale18(Operand.unwrap(operand_));
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _scale18);
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_scale18, operand_);
    }
}
