// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../integrity/LibIntegrity.sol";

/// @title OpCaller
/// @notice Opcode for getting the current caller.
library OpCaller {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.push(stackTop_);
    }

    function caller(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.push(uint256(uint160(msg.sender)));
    }
}
