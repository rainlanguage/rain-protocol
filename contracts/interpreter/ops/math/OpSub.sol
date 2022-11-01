// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpSub
/// @notice Opcode for subtracting N numbers.
library OpSub {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _sub(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ - b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFnN(stackTop_, _sub, Operand.unwrap(operand_));
    }

    function sub(InterpreterState memory, Operand operand_, StackTop stackTop_)
        internal
        view
        returns (StackTop stackTopAfter_)
    {
        return stackTop_.applyFnN(_sub, Operand.unwrap(operand_));
    }
}
