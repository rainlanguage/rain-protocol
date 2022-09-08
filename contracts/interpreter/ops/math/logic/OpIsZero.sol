// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../LibInterpreter.sol";
import "../../../integrity/LibIntegrity.sol";

/// @title OpIsZero
/// @notice Opcode for checking if the stack top is zero.
library OpIsZero {
    using LibCast for bool;
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function _isZero(uint256 a_) internal pure returns (uint256) {
        return (a_ == 0).asUint256();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _isZero);
    }

    function isZero(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_isZero);
    }
}
