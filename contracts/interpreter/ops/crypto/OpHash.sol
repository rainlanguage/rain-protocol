// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../../type/LibCast.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpHash
/// @notice Opcode for hashing a list of values.
library OpHash {
    using LibStackTop for StackTop;
    using LibCast for uint256[];
    using LibIntegrityState for IntegrityState;

    function _hash(uint256[] memory values_) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(values_)));
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFn(stackTop_, _hash, Operand.unwrap(operand_));
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function hash(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_hash, Operand.unwrap(operand_));
    }
}
