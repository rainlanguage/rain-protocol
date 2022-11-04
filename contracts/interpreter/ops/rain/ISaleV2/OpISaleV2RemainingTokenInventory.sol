// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../sale/ISaleV2.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpISaleV2RemainingTokenInventory
/// @notice Opcode for ISaleV2 `remainingTokenInventory`.
library OpISaleV2RemainingTokenInventory {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function f(uint256 sale_) internal view returns (uint256) {
        return ISaleV2(address(uint160(sale_))).remainingTokenInventory();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, f);
    }

    /// Stack `remainingTokenInventory`.
    function run(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(f);
    }
}
