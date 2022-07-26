// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpIsZero
/// @notice Opcode for checking if the stack top is zero.
library OpIsZero {
    using LibCast for bool;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function isZero(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        (StackTop location_, uint256 a_) = stackTop_.pop();
        location_.set((a_ == 0).asUint256());
        return stackTop_;
    }
}
