// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../sale/ISaleV2.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpISaleV2TotalReserveReceived
/// @notice Opcode for ISaleV2 `totalReserveReceived`.
library OpISaleV2TotalReserveReceived {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function f(uint256 sale_) internal view returns (uint256) {
        return ISaleV2(address(uint160(sale_))).totalReserveReceived();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, f);
    }

    /// Stack `totalReserveReceived`.
    function run(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(f);
    }
}
