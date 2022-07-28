// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpFixedPointScale18Div
/// @notice Opcode for performing scale 18 fixed point division.
library OpFixedPointScale18Div {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _scale18Div(
        Operand operand_,
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256) {
        return a_.scale18(Operand.unwrap(operand_)).fixedPointDiv(b_);
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _scale18Div);
    }

    function scale18Div(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_scale18Div, operand_);
    }
}
