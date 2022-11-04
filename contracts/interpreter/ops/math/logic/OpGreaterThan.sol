// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../run/LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpGreaterThan
/// @notice Opcode to compare the top two stack values.
library OpGreaterThan {
    using LibCast for bool;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _greaterThan(
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256) {
        return (a_ > b_).asUint256();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _greaterThan);
    }

    function greaterThan(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_greaterThan);
    }
}
