// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../runtime/LibStackTop.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpFixedPointDiv
/// @notice Opcode performing 18 fixed point division.
library OpFixedPointDiv {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _fixedPointDiv(
        Operand,
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256) {
        return a_.fixedPointDiv(b_);
    }

    // function integrity(
    //     IntegrityState memory integrityState_,
    //     Operand,
    //     StackTop stackTop_
    // ) internal pure returns (StackTop) {
    //     return integrityState_.apply(stackTop_, _fixedPointDiv);
    // }

    // function intern(
    //     VMState memory,
    //     Operand,
    //     StackTop stackTop_
    // ) internal view returns (StackTop) {
    //     return stackTop_.apply(_fixedPointDiv);
    // }

    // function extern(uint256[] memory inputs_)
    //     internal
    //     view
    //     returns (uint256[] memory)
    // {
    //     return inputs_.apply(_fixedPointDiv);
    // }
}
