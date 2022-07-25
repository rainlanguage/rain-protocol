// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";

/// @title OpFixedPointScale18Mul
/// @notice Opcode for performing scale 18 fixed point multiplication.
library OpFixedPointScale18Mul {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;

    function scale18Mul(
        VMState memory,
        uint256 operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 a_,
            uint256 b_
        ) = stackTop_.popAndPeek();
        location_.set(a_.scale18(operand_).fixedPointMul(b_));
        return stackTopAfter_;
    }
}
