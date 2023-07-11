// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.solmem/lib/LibPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/eval/LibEval.sol";
import "rain.solmem/lib/LibMemCpy.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";

/// @title OpCall
/// @notice Opcode for calling eval with a new scope. The construction of this
/// scope is split across integrity and runtime responsibilities. When the
/// integrity checks are done the expression being called has all its integrity
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
    using LibEval for InterpreterState;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibStackPointer for Pointer;
    using LibPointer for Pointer;
    using LibUint256Array for uint256;

    /// Interpreter integrity logic.
    /// The basic movements on the outer stack are to pop the inputs and push the
    /// outputs, but the called source doesn't have access to a separately
    /// allocated region of memory. There's only a single shared memory
    /// allocation for all executions and sub-executions, so we recursively run
    /// integrity checks on the called source relative to the current stack
    /// position.
    /// @param integrityCheckState The state of the current integrity check.
    /// @param operand The operand associated with this call.
    /// @param stackTop The current stack top within the integrity check.
    /// @return The stack top after the call movements are applied.
    function integrity(
        IntegrityCheckState memory integrityCheckState,
        Operand operand,
        Pointer stackTop
    ) internal view returns (Pointer) {
        // Unpack the operand to get IO and the source to be called.
        uint256 inputs = Operand.unwrap(operand) & MASK_4BIT;
        uint256 outputs = (Operand.unwrap(operand) >> 4) & MASK_4BIT;
        SourceIndex callSourceIndex = SourceIndex.wrap(
            uint16(Operand.unwrap(operand) >> 8)
        );

        // Remember the outer stack bottom and highwater.
        Pointer stackBottom = integrityCheckState.stackBottom;
        Pointer stackHighwater = integrityCheckState.stackHighwater;

        // Set the inner stack bottom to below the inputs and highwater to
        // protect the inputs from being popped internally.
        integrityCheckState.stackBottom = integrityCheckState.pop(
            stackTop,
            inputs
        );
        integrityCheckState.stackHighwater = stackTop.unsafeSubWord();

        // Ensure the integrity of the inner source on the current state using
        // the stack top above the inputs as the starting stack top.
        // Contraints namespace is irrelevant here.
        integrityCheckState.ensureIntegrity(
            callSourceIndex,
            stackTop,
            uint8(outputs)
        );

        // Reinstate the original highwater before handling outputs as single
        // outputs can be nested but multioutput will move the highwater.
        integrityCheckState.stackHighwater = stackHighwater;

        // The outer stack top will move above the outputs relative to the inner
        // stack bottom. At runtime any values that are not outputs will be
        // removed so they do not need to be accounted for here.
        stackTop = integrityCheckState.push(
            integrityCheckState.stackBottom,
            outputs
        );

        // Reinstate the outer stack bottom.
        integrityCheckState.stackBottom = stackBottom;

        return stackTop;
    }

    /// Call eval with a new scope.
    /// @param state_ The state of the current evaluation.
    /// @param operand_ The operand associated with this call.
    /// @param stackTop_ The current stack top within the evaluation.
    /// @return stackTopAfter_ The stack top after the call is evaluated.
    function run(
        InterpreterState memory state_,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer stackTopAfter_) {
        // Unpack the operand to get IO and the source to be called.
        uint256 inputs_ = Operand.unwrap(operand_) & MASK_4BIT;
        uint256 outputs_ = (Operand.unwrap(operand_) >> 4) & MASK_4BIT;
        SourceIndex callSourceIndex_ = SourceIndex.wrap(
            uint16(Operand.unwrap(operand_) >> 8)
        );

        // Remember the outer stack bottom.
        Pointer stackBottom_ = state_.stackBottom;

        // Set the inner stack bottom to below the inputs.
        state_.stackBottom = stackTop_.unsafeSubWords(inputs_);

        // Eval the source from the operand on the current state using the stack
        // top above the inputs as the starting stack top. The final stack top
        // is where we will read outputs from below.
        Pointer stackTopEval_ = state_.eval(callSourceIndex_, stackTop_);
        // Normalize the inner final stack so that it contains only the outputs
        // starting from the inner stack bottom.
        LibMemCpy.unsafeCopyWordsTo(
            Pointer.wrap(
                Pointer.unwrap(stackTopEval_.unsafeSubWords(outputs_))
            ),
            Pointer.wrap(Pointer.unwrap(state_.stackBottom)),
            outputs_
        );

        // The outer stack top should now point above the outputs.
        stackTopAfter_ = state_.stackBottom.unsafeAddWords(outputs_);

        // The outer stack bottom needs to be reinstated as it was before eval.
        state_.stackBottom = stackBottom_;
    }
}
