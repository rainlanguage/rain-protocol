// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpLoopN
/// @notice Opcode for looping a static number of times.
library OpLoopN {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory,
        uint256,
        StackTop
    ) internal view returns (StackTop) {
        revert("UNIMPLEMENTED");
    }

    /// Loop the stack `operand_` times.
    function loopN(
        VMState memory state_,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 n_ = operand_ & 0x0F;
        uint256 loopSourceIndex_ = (operand_ & 0xF0) >> 4;
        for (uint256 i_ = 0; i_ <= n_; i_++) {
            stackTop_ = state_.eval(state_, loopSourceIndex_, stackTop_);
        }
        return stackTop_;
    }
}
