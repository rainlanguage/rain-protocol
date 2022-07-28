// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpDebug
/// @notice Opcode for debugging state.
library OpDebug {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory,
        Operand,
        StackTop
    ) internal view returns (StackTop) {
        // Debug doesn't modify the state.
    }

    /// Debug the current state.
    function debug(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        state_.debug(stackTop_, DebugStyle(Operand.unwrap(operand_)));
        return stackTop_;
    }
}
