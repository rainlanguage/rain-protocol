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
    }
}
