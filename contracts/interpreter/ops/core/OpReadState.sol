// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpReadState
/// @notice Opcode for reading from storage.
library OpReadState {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            // Pop key
            // Stack value
            function(uint) internal pure returns (uint) fn_;
            return integrityState_.applyFn(stackTop_, fn_);
        }
    }

    function run(
        InterpreterState memory,
        Operand,
        StackTop
    ) internal pure returns (StackTop) {
        // This must be implemented on the interpreter itself so that storage
        // reads can happen.
        revert("UNIMPLEMENTED");
    }
}
