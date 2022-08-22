// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../runtime/LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

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
        return integrityState_.apply(stackTop_, _lessThan);
    }

    function lessThan(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.apply(_lessThan);
    }

    function extern(uint256[] memory inputs_)
        internal
        view
        returns (uint256[] memory)
    {
        return inputs_.apply(_lessThan);
    }
}
