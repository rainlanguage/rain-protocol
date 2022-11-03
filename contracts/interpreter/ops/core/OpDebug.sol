// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpDebug
/// @notice Opcode for debugging state. Uses the standard debugging logic from
/// InterpreterState.debug.
library OpDebug {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;

    /// Interpreter integrity for debug.
    /// Debug doesn't modify the stack.
    function integrity(
        IntegrityState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        // Try to build a debug style from the operand to ensure we can enumerate
        // it.
        DebugStyle(Operand.unwrap(operand_));
        return stackTop_;
    }

    /// Debug the current state.
    function debug(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        DebugStyle debugStyle_ = DebugStyle(Operand.unwrap(operand_));

        state_.debug(stackTop_, debugStyle_);

        return stackTop_;
    }
}
