// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpEvery
/// @notice Opcode to compare the top N stack values.
library OpEvery {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        function(uint256[] memory) internal view returns (uint256) fn_;
        return
            integrityState_.applyFn(stackTop_, fn_, Operand.unwrap(operand_));
    }

    // EVERY
    // EVERY is either the first item if every item is nonzero, else 0.
    // operand_ is the length of items to check.
    function every(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        StackTop bottom_ = stackTop_.down(Operand.unwrap(operand_));
        for (
            StackTop i_ = bottom_;
            StackTop.unwrap(i_) < StackTop.unwrap(stackTop_);
            i_ = i_.up()
        ) {
            if (i_.peekUp() == 0) {
                return bottom_.push(0);
            }
        }
        return bottom_.up();
    }
}
