// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierwiseCombine.sol";
import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "../../../math/Binary.sol";

/// @title OpSelectLte
/// @notice Exposes `TierwiseCombine.selectLte` as an opcode.
library OpSelectLte {
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        unchecked {
            uint256 inputs_ = Operand.unwrap(operand_) & MASK_8BIT;
            require(inputs_ > 0, "SELECT_LTE_ZERO_INPUTS");
            return
                integrityState_.push(integrityState_.pop(stackTop_, inputs_));
        }
    }

    // Stacks the result of a `selectLte` combinator.
    // All `selectLte` share the same stack and argument handling.
    // Takes the `logic_` and `mode_` from the `operand_` high bits.
    // `logic_` is the highest bit.
    // `mode_` is the 2 highest bits after `logic_`.
    // The other bits specify how many values to take from the stack
    // as reports to compare against each other and the block number.
    function selectLte(
        InterpreterState memory,
        Operand operand_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        unchecked {
            uint inputs_ = Operand.unwrap(operand_) & MASK_8BIT;
            uint mode_ = (Operand.unwrap(operand_) >> 8) & MASK_2BIT;
            uint logic_ = Operand.unwrap(operand_) >> 10;
            (uint256 time_, uint256[] memory reports_) = stackTop_.list(
                inputs_
            );
            return
                reports_.asStackPointer().push(
                    TierwiseCombine.selectLte(logic_, mode_, time_, reports_)
                );
        }
    }
}
