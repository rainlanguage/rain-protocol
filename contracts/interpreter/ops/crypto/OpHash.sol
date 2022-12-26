// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackPointer.sol";
import "../../../array/LibUint256Array.sol";
import "../../../type/LibCast.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpHash
/// @notice Opcode for hashing a list of values.
library OpHash {
    using LibStackPointer for StackPointer;
    using LibCast for uint256[];
    using LibIntegrityCheck for IntegrityCheckState;

    function _hash(uint256[] memory values_) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(values_)));
    }

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return
            integrityState_.applyFn(stackTop_, _hash, Operand.unwrap(operand_));
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function hash(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return stackTop_.applyFn(_hash, Operand.unwrap(operand_));
    }
}
