// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpEqualTo
/// @notice Opcode to compare the top two stack values.
library OpEqualTo {
    using LibCast for bool;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    function equalTo(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 a_,
            uint256 b_
        ) = stackTop_.popAndPeek();
        location_.set((a_ == b_).asUint256());
        return stackTopAfter_;
    }
}
