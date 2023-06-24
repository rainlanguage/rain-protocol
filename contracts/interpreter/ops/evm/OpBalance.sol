// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibOp.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpBalance
/// @notice Opcode for getting the current native balance of an address.
library OpBalance {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibOp for Pointer;

    function f(uint256 account_) internal view returns (uint256 balance_) {
        return address(uint160(account_)).balance;
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
