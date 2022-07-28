// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

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
        return
            integrityState_.push(
                integrityState_.pop(stackTop_, Operand.unwrap(operand_))
            );
    }

    // EVERY
    // EVERY is either the first item if every item is nonzero, else 0.
    // operand_ is the length of items to check.
    function every(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        StackTop location_ = stackTop_.down(Operand.unwrap(operand_));
        for (StackTop i_ = location_; i_.lt(stackTop_); i_ = i_.up()) {
            if (i_.peekUp() == 0) {
                return location_.push(0);
            }
        }
        return location_.up();
    }
}
