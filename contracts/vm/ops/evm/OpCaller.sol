// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpCaller
/// @notice Opcode for getting the current caller.
library OpCaller {
    using LibStackTop for StackTop;

    function caller(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.push(uint256(uint160(msg.sender)));
    }
}
