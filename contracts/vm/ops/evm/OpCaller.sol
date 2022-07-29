// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpCaller
/// @notice Opcode for getting the current caller.
library OpCaller {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.push(stackTop_);
    }

    function caller(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.push(uint256(uint160(msg.sender)));
    }
}
