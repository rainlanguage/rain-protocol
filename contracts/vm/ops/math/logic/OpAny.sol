// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpAny
/// @notice Opcode to compare the top N stack values.
library OpAny {
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

    // ANY
    // ANY is the first nonzero item, else 0.
    // operand_ id the length of items to check.
    function any(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        StackTop location_ = stackTop_.down(Operand.unwrap(operand_));
        for (StackTop i_ = location_; i_.lt(stackTop_); i_ = i_.up()) {
            uint256 item_ = i_.peekUp();
            if (item_ > 0) {
                return location_.push(item_);
            }
        }
        return location_.up();
    }
}
