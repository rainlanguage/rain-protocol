// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "../../../kv/LibMemoryKV.sol";

/// @title OpSet
/// @notice Opcode for recording k/v state changes to be set in storage.
library OpSet {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;
    using LibMemoryKV for MemoryKV;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            function(uint, uint) internal pure fn_;
            return integrityState_.applyFn(stackTop_, fn_);
        }
    }

    function run(
        InterpreterState memory state_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            uint k_;
            uint v_;
            (stackTop_, k_) = stackTop_.pop();
            (stackTop_, v_) = stackTop_.pop();
            state_.stateKV = state_.stateKV.setVal(
                MemoryKVKey.wrap(k_),
                MemoryKVVal.wrap(v_)
            );
            return stackTop_;
        }
    }
}
