// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "./OpCall.sol";

/// @title OpWhile
/// @notice Opcode for looping while the stack top is nonzero. As we pre-allocate
/// all the memory for execution during integrity checks we have an apparent
/// contradiction here. If we do not know how many times the loop will run then
/// we cannot calculate the final stack height or intermediate pops and pushes.
/// To solve this we simply wrap `OpCall` which already has fixed inputs and
/// outputs and enforce that the outputs of each iteration is 1 more than the
/// inputs. We then consume the extra output as the condition for the decision
/// to loop again, thus the outputs = inputs for every iteration. If the stack
/// height does not change between iterations we do not care how many times we
/// loop (although the user paying gas might).
library OpDoWhile {
    using LibIntegrityCheck for IntegrityCheckState;
    using LibStackPointer for StackPointer;
    using LibInterpreterState for InterpreterState;

    /// Interpreter integrity for do while.
    /// The loop itself pops a single value from the stack to determine whether
    /// it should run another iteration of the loop. The source called by the
    /// loop must then put a value back on the stack in the same position to
    /// either continue or break the loop.
    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        unchecked {
            uint inputs_ = Operand.unwrap(operand_) & MASK_8BIT;
            /// We need outputs to be larger than inputs so inputs can't be the
            /// max value possible in 4 bits or outputs will overflow.
            require(inputs_ < MASK_4BIT, "OP_DO_WHILE_INPUTS");
            uint outputs_ = inputs_ + 1;
            Operand callOperand_ = Operand.wrap(
                Operand.unwrap(operand_) | (outputs_ << 4)
            );
            // Stack height changes are deterministic so if we call once we've
            // called a thousand times. Also we pop one output off the result of
            // the call to check the while condition.
            return
                integrityCheckState_.pop(
                    OpCall.integrity(
                        integrityCheckState_,
                        callOperand_,
                        stackTop_
                    )
                );
        }
    }

    /// Loop the stack while the stack top is true.
    function run(
        InterpreterState memory state_,
        Operand operand_,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        unchecked {
            uint inputs_ = Operand.unwrap(operand_) & MASK_8BIT;
            uint outputs_ = inputs_ + 1;
            Operand callOperand_ = Operand.wrap(
                Operand.unwrap(operand_) | (outputs_ << 4)
            );
            uint256 do_;
            (stackTop_, do_) = stackTop_.pop();
            while (do_ > 0) {
                stackTop_ = OpCall.run(state_, callOperand_, stackTop_);
                (stackTop_, do_) = stackTop_.pop();
            }
            return stackTop_;
        }
    }
}
