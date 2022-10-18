// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../runtime/LibStackTop.sol";
import "../../runtime/LibInterpreterState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpTimestamp
/// @notice Opcode for getting the current timestamp.
library OpTimestamp {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.push(stackTop_);
    }

    function timestamp(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.push(block.timestamp);
    }
}
