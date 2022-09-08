// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../../array/LibUint256Array.sol";
import "../../integrity/LibIntegrity.sol";

/// @title OpCall
/// @notice Opcode for calling eval with a new scope. The construction of this
/// scope is split across integrity and runtime responsibilities. When the
/// integrity checks are done the script being called has all its integrity
/// logic run, recursively if needed. The integrity checks are run against the
/// integrity state as it is but with the stack bottom set below the inputs to
/// the called source. This ensures that the sub-integrity checks do not
/// underflow what they perceive as a fresh stack, and it ensures that we set the
/// stack length long enough to cover all sub-executions as a single array in
/// memory. At runtime we trust the integrity checks have allocated enough runway
/// in the stack for all our recursive sub-calls so we simply move the stack
/// bottom in the state below the inputs during the call and move it back to
/// where it was after the call. Notably this means that reading from the stack
/// in the called source will 0 index from the first input, NOT the bottom of
/// the calling stack.
library OpCall {
    using LibIntegrity for IntegrityState;
    using LibStackTop for StackTop;
    using LibInterpreter for InterpreterState;

    /// VM integrity logic.
    /// The basic movements on the outer stack are to pop the inputs and push the
    /// outputs, but the called source doesn't have access to a separately
    /// allocated region of memory. There's only a single shared memory
    /// allocation for all executions and sub-executions, so we recursively run
    /// integrity checks on the called source relative to the current stack
    /// position.
    /// @param integrityState_ The state of the current integrity check.
    /// @param operand_ The operand associated with this call.
    /// @param stackTop_ The current stack top within the integrity check.
    /// @return stackTopAfter_ The stack top after the call movements are applied.
    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        // Unpack the operand to get IO and the source to be called.
        uint256 inputs_ = Operand.unwrap(operand_) & 0x7; // 00000111
        uint256 outputs_ = (Operand.unwrap(operand_) >> 3) & 0x3; // 00000011
        SourceIndex callSourceIndex_ = SourceIndex.wrap(
            (Operand.unwrap(operand_) >> 5) & 0x7 // 00000111
        );

        // Remember the outer stack bottom.
        StackTop stackBottom_ = integrityState_.stackBottom;

        // Set the inner stack bottom to below the inputs.
        integrityState_.stackBottom = integrityState_.pop(stackTop_, inputs_);

        // Ensure the integrity of the inner source on the current state using
        // the stack top above the inputs as the starting stack top.
        integrityState_.ensureIntegrity(callSourceIndex_, stackTop_, outputs_);

        // The outer stack top will move above the outputs relative to the inner
        // stack bottom. At runtime any values that are not outputs will be
        // removed so they do not need to be accounted for here.
        stackTopAfter_ = integrityState_.push(
            integrityState_.stackBottom,
            outputs_
        );

        // Reinstate the outer stack bottom.
        integrityState_.stackBottom = stackBottom_;
    }

    /// Call eval with a new scope.
    /// @param state_ The state of the current evaluation.
    /// @param operand_ The operand associated with this call.
    /// @param stackTop_ The current stack top within the evaluation.
    /// @return stackTopAfter_ The stack top after the call is evaluated.
    function call(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        // Unpack the operand to get IO and the source to be called.
        uint256 inputs_ = Operand.unwrap(operand_) & 0x7; // 00000111
        uint256 outputs_ = (Operand.unwrap(operand_) >> 3) & 0x3; // 00000011
        SourceIndex callSourceIndex_ = SourceIndex.wrap(
            (Operand.unwrap(operand_) >> 5) & 0x7 // 00000111
        );

        // Remember the outer stack bottom.
        StackTop stackBottom_ = state_.stackBottom;

        // Set the inner stack bottom to below the inputs.
        state_.stackBottom = stackTop_.down(inputs_);

        // Eval the source from the operand on the current state using the stack
        // top above the inputs as the starting stack top. The final stack top
        // is where we will read outputs from below.
        StackTop stackTopEval_ = state_.eval(callSourceIndex_, stackTop_);
        // Normalize the inner final stack so that it contains only the outputs
        // starting from the inner stack bottom.
        LibUint256Array.unsafeCopyValuesTo(
            StackTop.unwrap(stackTopEval_.down(outputs_)),
            StackTop.unwrap(state_.stackBottom),
            outputs_
        );

        // The outer stack top should now point above the outputs.
        stackTopAfter_ = state_.stackBottom.up(outputs_);

        // The outer stack bottom needs to be reinstated as it was before eval.
        state_.stackBottom = stackBottom_;
    }
}
