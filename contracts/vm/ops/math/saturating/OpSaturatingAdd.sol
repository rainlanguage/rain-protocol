// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";

/// @title OpSaturatingAdd
/// @notice Opcode for adding N numbers with saturating addition.
library OpSaturatingAdd {
    using SaturatingMath for uint256;
    using LibStackTop for StackTop;

    function saturatingAdd(
        VMState memory,
        uint256 operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop stackTopAfter_) {
        StackTop location_ = stackTop_.down(operand_);
        uint256 accumulator_ = location_.peekUp();
        stackTopAfter_ = location_.up();
        for (
            StackTop i_ = stackTopAfter_;
            i_.lt(stackTop_) && accumulator_ < type(uint256).max;
            i_ = i_.up()
        ) {
            accumulator_ = accumulator_.saturatingAdd(i_.peekUp());
        }
        location_.set(accumulator_);
    }
}
