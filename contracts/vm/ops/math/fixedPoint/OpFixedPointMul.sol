// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../runtime/LibStackTop.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpFixedPointMul
/// @notice Opcode for performing 18 decimal fixed point multiplication.
library OpFixedPointMul {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _fixedPointMul(
        Operand,
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256) {
        return a_.fixedPointMul(b_);
    }

    // function integrity(
    //     IntegrityState memory integrityState_,
    //     Operand,
    //     StackTop stackTop_
    // ) internal pure returns (StackTop) {
    //     return integrityState_.applyFn(stackTop_, _fixedPointMul);
    // }

    // function intern(
    //     VMState memory,
    //     Operand,
    //     StackTop stackTop_
    // ) internal view returns (StackTop) {
    //     return stackTop_.applyFn(_fixedPointMul);
    // }

    // function extern(uint256[] memory inputs_)
    //     internal
    //     view
    //     returns (uint256[] memory)
    // {
    //     return inputs_.apply(_fixedPointMul);
    // }
}
