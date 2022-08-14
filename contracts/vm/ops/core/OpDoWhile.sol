// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpWhile
/// @notice Opcode for looping while the stack top is nonzero. As we pre-allocate
/// all the memory for execution during integrity checks we have an apparent
/// contradiction here. If we do not know how many times the loop will run then
/// we cannot calculate the final stack height or intermediate pops and pushes.
/// To solve this we simply enforce that the stack height MUST NOT change between
/// loop iterations. Values MAY be popped and pushed to the stack within a single
/// loop iteration but the final height must remain unchanged. The EVM itself
/// gives a guard against infinite loops in the form of gas, so we do not need to
/// solve for that ourselves. Unlike call, the looping construct does not build
/// a new stack so the called source will be executing from the current stack
/// position with full access to all stack data. Call and loop MAY be combined
/// safely if a new stack is desired for each iteration.
library OpDoWhile {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// VM integrity for do while.
    /// The loop itself pops a single value from the stack to determine whether
    /// it should run another iteration of the loop. The source called by the
    /// loop must then put a value back on the stack in the same position to
    /// either continue or break the loop. I.e. the net movement of the called
    /// source must be a single push.
    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        // Check that an iteration of the loop ends where it starts.
        require(
            StackTop.unwrap(stackTop_) ==
                StackTop.unwrap(
                    integrityState_.ensureIntegrity(
                        integrityState_,
                        SourceIndex.wrap(Operand.unwrap(operand_)),
                        // The loop eval starts under the condition.
                        integrityState_.pop(stackTop_),
                        0
                    )
                ),
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
        uint256 do_;
        (stackTop_, do_) = stackTop_.pop();
        while (do_ > 0) {
            // eval is NOT allowed to change the stack top so we
            // ignore the return of eval. This is enforced by bounds
            // checks.
            stackTop_ = state_.eval(
                state_,
                SourceIndex.wrap(Operand.unwrap(operand_)),
                stackTop_
            );
            (stackTop_, do_) = stackTop_.pop();
        }
        return stackTop_;
    }
}
