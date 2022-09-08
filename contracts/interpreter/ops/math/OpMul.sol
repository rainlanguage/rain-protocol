// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../integrity/LibIntegrity.sol";

/// @title OpMul
/// @notice Opcode for multiplying N numbers.
library OpMul {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function _mul(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ * b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
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
