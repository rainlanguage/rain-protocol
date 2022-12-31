// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../run/LibStackPointer.sol";
import "../../../../type/LibCast.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpLessThan
/// @notice Opcode to compare the top two stack values.
library OpLessThan {
    using LibStackPointer for StackPointer;
    using LibCast for bool;
    using LibIntegrityCheck for IntegrityCheckState;

    function _lessThan(
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256 c_) {
        assembly ("memory-safe") {
            c_ := lt(a_, b_)
        }
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return integrityCheckState_.applyFn(stackTop_, _lessThan);
    }

    function run(
        InterpreterState memory,
        Operand,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return stackTop_.applyFn(_lessThan);
    }
}
