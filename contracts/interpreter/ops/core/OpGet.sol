// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpGet
/// @notice Opcode for reading from storage.
library OpGet {
    using LibStackPointer for StackPointer;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        unchecked {
            // Pop key
            // Stack value
            function(uint256) internal pure returns (uint256) fn_;
            return integrityCheckState_.applyFn(stackTop_, fn_);
        }
    }

    function run(
        InterpreterState memory,
        Operand,
        StackPointer
    ) internal pure returns (StackPointer) {
        // This must be implemented on the interpreter itself so that storage
        // reads can happen.
        revert("UNIMPLEMENTED");

            /// Implements runtime behaviour of the `get` opcode. Attempts to lookup the
    /// key in the memory key/value store then falls back to the interpreter's
    /// storage mapping of state changes. If the key is not found in either the
    /// value will fallback to `0` as per default Solidity/EVM behaviour.
    /// @param interpreterState_ The interpreter state of the current eval.
    /// @param stackTop_ Pointer to the current stack top.
    function opGet(
        InterpreterState memory interpreterState_,
        Operand,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        uint256 k_;
        (stackTop_, k_) = stackTop_.pop();
        MemoryKVPtr kvPtr_ = interpreterState_.stateKV.getPtr(
            MemoryKVKey.wrap(k_)
        );
        uint256 v_ = 0;
        if (MemoryKVPtr.unwrap(kvPtr_) > 0) {
            v_ = MemoryKVVal.unwrap(kvPtr_.readPtrVal());
        } else {
            v_ = state[interpreterState_.namespace][k_];
        }
        return stackTop_.push(v_);
    }
    }
}
