// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "./OpCall.sol";
import "../../../idempotent/LibIdempotentFlag.sol";

/// @title OpFoldContext
/// Folds over columns of context from their start to end. Expressions do not
/// have a good way of handling dynamic lengths of things, and that is
/// intentional to avoid end users having to write out looping constructs of the
/// form `i = 0; i < length; i++` is is so tedious and error prone in software
/// development generally. It is very easy to implement "off by one" errors in
/// this form, and requires sourcing a length from somewhere. This opcode exposes
/// a pretty typical fold as found elsewhere in functional programming. A start
/// column and width of columns can be specified, the rows will be iterated and
/// pushed to the stack on top of any additional inputs specified by the
/// expression. The additional inputs are the accumulators and so the number of
/// outputs in the called source needs to match the number of accumulator inputs.
library OpFoldContext {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint sourceIndex_ = Operand.unwrap(operand_) & MASK_4BIT;
            uint column_ = (Operand.unwrap(operand_) >> 4) & MASK_4BIT;
            uint width_ = (Operand.unwrap(operand_) >> 8) & MASK_4BIT;
            uint inputs_ = Operand.unwrap(operand_) >> 12;
            uint callInputs_ = width_ + inputs_;

            for (uint i_ = 0; i_ < width_; i_++) {
                integrityState_.contextReads = IdempotentFlag.unwrap(
                    LibIdempotentFlag.set16x16Column(
                        IdempotentFlag.wrap(integrityState_.contextReads),
                        column_ + i_
                    )
                );
            }

            // Outputs for call is the same as the inputs.
            Operand callOperand_ = Operand.wrap(
                (sourceIndex_ << 8) | (inputs_ << 4) | callInputs_
            );

            // First the width of the context columns being folded is pushed to
            // the stack. Ignore the highwater here as `OpCall.integrity` has its
            // own internal highwater handling over all its inputs and outputs.
            stackTop_ = integrityState_.pushIgnoreHighwater(stackTop_, width_);

            // Then we loop over call taking the width and extra inputs, then
            // returning the same number of outputs as non-width inputs.
            return OpCall.integrity(integrityState_, callOperand_, stackTop_);
        }
    }

    function run(
        InterpreterState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint sourceIndex_ = Operand.unwrap(operand_) & MASK_4BIT;
            uint column_ = (Operand.unwrap(operand_) >> 4) & MASK_4BIT;
            uint width_ = (Operand.unwrap(operand_) >> 8) & MASK_4BIT;
            uint inputs_ = Operand.unwrap(operand_) >> 12;
            // Call will take the width of the context rows being copied and the
            // base inputs that will be the accumulators of the fold.
            uint callInputs_ = width_ + inputs_;

            // Fold over the entire context. This will error with an OOB index
            // if the context columns are not of the same length.
            for (uint i_ = 0; i_ < state_.context[column_].length; i_++) {
                // Push the width of the context columns onto the stack as rows.
                for (uint j_ = 0; j_ < width_; j_++) {
                    stackTop_ = stackTop_.push(
                        state_.context[column_ + j_][i_]
                    );
                }
                // The outputs of call are the same as the base inputs, this is
                // similar to `OpDoWhile` so that we don't have to care how many
                // iterations there are in order to calculate the stack.
                Operand callOperand_ = Operand.wrap(
                    (sourceIndex_ << 8) | (inputs_ << 4) | callInputs_
                );
                stackTop_ = OpCall.run(state_, callOperand_, stackTop_);
            }

            return stackTop_;
        }
    }
}
