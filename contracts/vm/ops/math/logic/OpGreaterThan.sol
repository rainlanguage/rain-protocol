// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../runtime/LibStackTop.sol";
import "../../../../type/LibCast.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpGreaterThan
/// @notice Opcode to compare the top two stack values.
library OpGreaterThan {
    using LibCast for bool;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _greaterThan(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        return (a_ > b_).asUint256();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.apply(stackTop_, _greaterThan);
    }

    function intern(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.apply(_greaterThan);
    }

    function extern(uint256[] memory inputs_)
        internal
        view
        returns (uint256[] memory)
    {
        return inputs_.apply(_greaterThan);
    }
}
