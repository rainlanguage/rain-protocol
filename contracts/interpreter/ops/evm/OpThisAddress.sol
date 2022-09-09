// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../deploy/LibIntegrity.sol";

/// @title OpThisAddress
/// @notice Opcode for getting the address of the current contract.
library OpThisAddress {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.push(stackTop_);
    }

    function thisAddress(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.push(uint256(uint160(address(this))));
    }
}
