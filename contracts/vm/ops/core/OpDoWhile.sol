// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpWhile
/// @notice Opcode for looping while the stack top is true.
library OpDoWhile {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        // Check that an iteration of the loop ends where it starts.
        require(
            StackTop.unwrap(stackTop_) ==
                StackTop.unwrap(integrityState_.ensureIntegrity(
                    integrityState_,
                    SourceIndex.wrap(Operand.unwrap(operand_)),
                    // The loop eval starts under the condition.
                    integrityState_.pop(stackTop_),
                    0
                )),
            "LOOP_SHIFT"
        );
        // Final position is under condition.
        return integrityState_.pop(stackTop_);
    }

    /// Loop the stack while the stack top is true.
    function doWhile(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 todo_;
        (stackTop_, todo_) = stackTop_.pop();
        while (todo_ > 0) {
            // eval is NOT allowed to change the stack top so we
            // ignore the return of eval. This is enforced by bounds
            // checks.
            state_.eval(
                state_,
                SourceIndex.wrap(Operand.unwrap(operand_)),
                stackTop_
            );
            (stackTop_, todo_) = stackTop_.pop();
        }
        return stackTop_;
    }
}
