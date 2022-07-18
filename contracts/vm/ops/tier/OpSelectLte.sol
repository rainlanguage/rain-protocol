// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierwiseCombine.sol";
import "../../LibStackTop.sol";

/// @title OpSelectLte
/// @notice Exposes `TierwiseCombine.selectLte` as an opcode.
library OpSelectLte {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];

    function stackPops(uint256 operand_) internal pure returns (uint256) {
        unchecked {
            uint256 reportsLength_ = operand_ & 0x1F; // & 00011111
            require(reportsLength_ > 0, "BAD_OPERAND");
            return reportsLength_;
        }
    }

    // Stacks the result of a `selectLte` combinator.
    // All `selectLte` share the same stack and argument handling.
    // Takes the `logic_` and `mode_` from the `operand_` high bits.
    // `logic_` is the highest bit.
    // `mode_` is the 2 highest bits after `logic_`.
    // The other bits specify how many values to take from the stack
    // as reports to compare against each other and the block number.
    function selectLte(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        unchecked {
            uint256 logic_ = operand_ >> 7;
            uint256 mode_ = (operand_ >> 5) & 0x3; // & 00000011
            uint256 reportsLength_ = operand_ & 0x1F; // & 00011111
            (uint256 time_, uint256[] memory reports_) = stackTop_.list(
                reportsLength_
            );
            return
                reports_.asStackTop().push(
                    TierwiseCombine.selectLte(logic_, mode_, time_, reports_)
                );
        }
    }
}
