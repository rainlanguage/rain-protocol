// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpStorage
/// @notice Opcode for reading from storage.
library OpStorage {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// Stack the value in a storage slot.
    function storageRead(VMState memory, uint256 operand_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        assembly ("memory-safe") {
            mstore(
                stackTop_,
                sload(operand_)
            )
        }
        return stackTop_.up();
    }
}
