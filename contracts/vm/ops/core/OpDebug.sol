// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpDebug
/// @notice Opcode for debugging state.
library OpDebug {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// Debug the current state.
    function debug(VMState memory state_, uint256 operand_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        state_.debug(stackTop_, DebugStyle(operand_));
        return stackTop_;
    }
}
