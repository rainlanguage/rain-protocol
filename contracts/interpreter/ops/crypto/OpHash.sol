// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "rain.interpreter/lib/LibOp.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpHash
/// @notice Opcode for hashing a list of values.
library OpHash {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibOp for Pointer;

    function f(uint256[] memory values_) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(values_)));
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.applyFn(
                stackTop_,
                f,
                Operand.unwrap(operand_)
            );
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f, Operand.unwrap(operand_));
    }
}
