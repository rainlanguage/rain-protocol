// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierReport.sol";
import "../../LibStackTop.sol";

library OpUpdateTimesForTierRange {
    using LibStackTop for StackTop;

    // Stacks a report with updated times over tier range.
    // The start and end tier are taken from the low and high bits of
    // the `operand_` respectively.
    // The report to update and timestamp to update to are both
    // taken from the stack.
    function updateTimesForTierRange(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        uint256 startTier_ = operand_ & 0x0f; // & 00001111
        uint256 endTier_ = (operand_ >> 4) & 0x0f; // & 00001111

        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 report_,
            uint256 timestamp_
        ) = stackTop_.popAndPeek();

        location_.set(
            TierReport.updateTimesForTierRange(
                report_,
                startTier_,
                endTier_,
                timestamp_
            )
        );
        return stackTopAfter_;
    }
}
