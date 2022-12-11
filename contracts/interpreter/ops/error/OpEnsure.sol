// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpEnsure
/// @notice Opcode for requiring some truthy values.
library OpEnsure {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _ensure(uint256 a_) internal pure {
        assembly ("memory-safe") {
            if iszero(a_) {
                revert(0, 0)
            }
        }
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFnN(
                stackTop_,
                _ensure,
                Operand.unwrap(operand_)
            );
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFnN(_ensure, Operand.unwrap(operand_));
    }
}
