// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../run/LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpLessThan
/// @notice Opcode to compare the top two stack values.
library OpLessThan {
    using LibStackTop for StackTop;
    using LibCast for bool;
    using LibIntegrityState for IntegrityState;

    function _lessThan(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return (a_ < b_).asUint256();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _lessThan);
    }

    function lessThan(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_lessThan);
    }
}
