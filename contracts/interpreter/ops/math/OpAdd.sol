// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../LibInterpreter.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpAdd
/// @notice Opcode for adding N numbers.
library OpAdd {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _add(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFnN(stackTop_, _add, Operand.unwrap(operand_));
    }

    function add(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFnN(_add, Operand.unwrap(operand_));
    }
}
