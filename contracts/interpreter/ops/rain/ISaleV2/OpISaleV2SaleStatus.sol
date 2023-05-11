// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "rain.interface.sale/ISaleV2.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpISaleV2SaleStatus
/// @notice Opcode for ISaleV2 `saleStatus`.
library OpISaleV2SaleStatus {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 sale_) internal view returns (uint256) {
        return uint256(ISaleV2(address(uint160(sale_))).saleStatus());
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    /// Stack `saleStatus`.
    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
