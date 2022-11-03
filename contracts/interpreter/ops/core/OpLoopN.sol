// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpLoopN
/// @notice Opcode for looping a static number of times.
library OpLoopN {
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 n_ = Operand.unwrap(operand_) & 0x0F;
            SourceIndex loopSourceIndex_ = SourceIndex.wrap(
                (Operand.unwrap(operand_) & 0xF0) >> 4
            );
            for (uint256 i_ = 0; i_ < n_; i_++) {
                stackTop_ = integrityState_.ensureIntegrity(
                    loopSourceIndex_,
                    stackTop_,
                    0
                );
            }
            return stackTop_;
        }
    }

    /// Loop the stack `operand_` times.
    function loopN(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 n_ = Operand.unwrap(operand_) & 0x0F;
        SourceIndex loopSourceIndex_ = SourceIndex.wrap(
            (Operand.unwrap(operand_) >> 4) & 0x0F
        );
        for (uint256 i_ = 0; i_ < n_; i_++) {
            stackTop_ = state_.eval(loopSourceIndex_, stackTop_);
        }
        return stackTop_;
    }
}
