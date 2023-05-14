// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "rain.lib.memkv/LibMemoryKV.sol";

/// @title OpGet
/// @notice Opcode for reading from storage.
library OpGet {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibMemoryKV for MemoryKV;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        unchecked {
            // Pop key
            // Stack value
            function(uint256) internal pure returns (uint256) fn_;
            return integrityCheckState_.applyFn(stackTop_, fn_);
        }
    }

    /// Implements runtime behaviour of the `get` opcode. Attempts to lookup the
    /// key in the memory key/value store then falls back to the interpreter's
    /// storage interface as an external call. If the key is not found in either,
    /// the value will fallback to `0` as per default Solidity/EVM behaviour.
    /// @param interpreterState_ The interpreter state of the current eval.
    /// @param stackTop_ Pointer to the current stack top.
    function run(
        InterpreterState memory interpreterState_,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        uint256 key_;
        (stackTop_, key_) = stackTop_.unsafePop();
        (uint256 exists_, MemoryKVVal value_) = interpreterState_.stateKV.get(
            MemoryKVKey.wrap(key_)
        );

        // Cache MISS, get from external store.
        if (exists_ == 0) {
            uint256 storeValue_ = interpreterState_.store.get(
                interpreterState_.namespace,
                key_
            );

            // Push fetched value to memory to make subsequent lookups on the
            // same key find a cache HIT.
            interpreterState_.stateKV = interpreterState_.stateKV.set(
                MemoryKVKey.wrap(key_),
                MemoryKVVal.wrap(storeValue_)
            );

            return stackTop_.unsafePush(storeValue_);
        }
        // Cache HIT.
        else {
            return stackTop_.unsafePush(MemoryKVVal.unwrap(value_));
        }
    }
}
