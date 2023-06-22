// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "rain.interface.sale/ISaleV2.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibOp.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpISaleV2TotalReserveReceived
/// @notice Opcode for ISaleV2 `totalReserveReceived`.
library OpISaleV2TotalReserveReceived {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 sale_) internal view returns (uint256) {
        return ISaleV2(address(uint160(sale_))).totalReserveReceived();
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    /// Stack `totalReserveReceived`.
    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
