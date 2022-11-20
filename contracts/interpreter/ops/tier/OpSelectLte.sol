// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierwiseCombine.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "../../../math/Binary.sol";

/// @title OpSelectLte
/// @notice Exposes `TierwiseCombine.selectLte` as an opcode.
library OpSelectLte {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
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
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            uint inputs_ = Operand.unwrap(operand_) & MASK_8BIT;
            uint mode_ = (Operand.unwrap(operand_) >> 8) & MASK_2BIT;
            uint logic_ = Operand.unwrap(operand_) >> 10;
            (uint256 time_, uint256[] memory reports_) = stackTop_.list(
                inputs_
            );
            return
                reports_.asStackTop().push(
                    TierwiseCombine.selectLte(logic_, mode_, time_, reports_)
                );
        }
    }
}
