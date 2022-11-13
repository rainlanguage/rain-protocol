// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpChangeState
/// @notice Opcode for recording k/v state changes to be set in storage.
library OpChangeState {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand ,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            integrityState_.stateChangesLength += 2;
            function(uint, uint) internal pure fn_;
            return integrityState_.applyFn(stackTop_, fn_);
        }
    }

    function run(
        InterpreterState memory state_,
        Operand ,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            uint k_;
            uint v_;
            (stackTop_, k_) = stackTop_.pop();
            (stackTop_, v_) = stackTop_.pop();
            state_.stateChangesCursor = state_.stateChangesCursor.push(k_).push(
                v_
            );
            return stackTop_;
        }
    }
}
