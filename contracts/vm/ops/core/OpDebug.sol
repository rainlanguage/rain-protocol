// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

enum DebugStyle {
    StackIndex,
    Stack,
    Constant,
    Context,
    Source
}

/// @title OpDebug
/// @notice Opcode for debugging state.
library OpDebug {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        // Debug doesn't modify the state.
        return stackTop_;
    }

    /// Debug the current state.
    function debug(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint debugIndex_ = Operand.unwrap(operand_) & 0xFF;
        DebugStyle debugStyle_ = DebugStyle(Operand.unwrap(operand_) >> 8 & 0xFF);
        if (debugStyle_ == DebugStyle.StackIndex) {
            console.log(state_.stackBottom.toIndex(stackTop_));
        } else if (debugStyle_ == DebugStyle.Stack) {
            console.log(state_.stackBottom.down().asUint256Array()[debugIndex_]);
        } else if (debugStyle_ == DebugStyle.Constant) {
            console.log(state_.constantsBottom.down().asUint256Array()[debugIndex_]);
        } else if (debugStyle_ == DebugStyle.Context) {
            console.log(state_.context[debugIndex_]);
        } else {
            console.logBytes(state_.sources[debugIndex_]);
        }
        return stackTop_;
    }
}
