// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpDebug
/// @notice Opcode for debugging state. Uses the standard debugging logic from
/// VMState.debug.
library OpDebug {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// VM integrity for debug.
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
    function intern(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        DebugStyle debugStyle_ = DebugStyle(Operand.unwrap(operand_));

        state_.debug(stackTop_, debugStyle_);

        return stackTop_;
    }

    // function extern(uint256[] memory) internal view returns (uint256[] memory) {
    //     revert IRainVMExternal.UnsupportedDispatch();
    // }
}
