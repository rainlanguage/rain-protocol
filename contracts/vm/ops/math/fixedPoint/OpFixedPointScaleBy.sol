// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";

/// @title OpFixedPointScaleBy
/// @notice Opcode for scaling a number by some OOMs.
library OpFixedPointScaleBy {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;

    function scaleBy(VMState memory, uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        (StackTop location_, uint256 a_) = stackTop_.pop();
        location_.set(a_.scaleBy(int8(uint8(operand_))));
        return stackTop_;
    }
}
