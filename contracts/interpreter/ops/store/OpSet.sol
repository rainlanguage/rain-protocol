// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "rain.lib.memkv/lib/LibMemoryKV.sol";

/// @title OpSet
/// @notice Opcode for recording k/v state changes to be set in storage.
library OpSet {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibMemoryKV for MemoryKV;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        unchecked {
            function(uint256, uint256) internal pure fn_;
            return integrityCheckState_.applyFn(stackTop_, fn_);
        }
    }

    function run(
        InterpreterState memory state_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        unchecked {
            uint256 k_;
            uint256 v_;
            (stackTop_, v_) = stackTop_.unsafePop();
            (stackTop_, k_) = stackTop_.unsafePop();
            state_.stateKV = state_.stateKV.set(
                MemoryKVKey.wrap(k_),
                MemoryKVVal.wrap(v_)
            );
            return stackTop_;
        }
    }
}
