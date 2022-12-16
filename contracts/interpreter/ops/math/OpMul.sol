// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

import "hardhat/console.sol";

/// @title OpMul
/// @notice Opcode for multiplying N numbers.
library OpMul {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _mul(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ * b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        console.log("mul", StackTop.unwrap(stackTop_), Operand.unwrap(operand_));
        return
            integrityState_.applyFnN(stackTop_, _mul, Operand.unwrap(operand_));
    }

    function mul(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return stackTop_.applyFnN(_mul, Operand.unwrap(operand_));
    }
}
