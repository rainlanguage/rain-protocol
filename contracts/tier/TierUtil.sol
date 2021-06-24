// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";

library TierUtil {

    uint256 constant public UNINITIALIZED = uint256(-1);

    /// Returns the highest status achieved relative to a block number and status report.
    ///
    /// Note that typically the statusReport will be from the _current_ contract state.
    /// When the `statusReport` comes from a later block than the `blockNumber` this means
    /// the user must have held the status continuously from `blockNumber` _through_ to the report block.
    /// I.e. NOT a snapshot.
    /// @param report_ A status report as per ITier
    /// @param blockNumber_ The block number check the statuses against.
    /// @return The highest status held since `blockNumber` according to `report`.
    function tierAtBlockFromReport(
        uint256 report_,
        uint256 blockNumber_
    )
        internal pure returns (ITier.Tier)
    {
        for (uint256 i = 0; i < 8; i++) {
            if (uint32(uint256(report_ >> (i*32))) > uint32(blockNumber_)) {
                return ITier.Tier(i);
            }
        }
        return ITier.Tier(8);
    }

    /// Returns the block that a given status has been held since according to a status report.
    ///
    /// The status report SHOULD encode "never" as 0xFFFFFFFF
    /// @param report_ The status report to read a block number from.
    /// @param tierInt_ The status integer to read the block number for.
    /// @return The block number this status has been held since.
    function tierBlock(uint256 report_, uint256 tierInt_)
        internal
        pure
        returns (uint256)
    {
        // ZERO is a special case. Everyone has always been at least ZERO, since block 0.
        if (tierInt_ == 0) {
            return 0;
        } else {
            uint256 _offset = (tierInt_ - 1) * 32;
            return uint256(uint32(
                uint256(
                    report_ >> _offset
                )
            ));
        }
    }

    /// Resets all the tiers above the reference tier.
    ///
    /// @param report_ Status report to truncate with high bit 1s.
    /// @param tierInt_ Status int level to truncate above (exclusive).
    /// @return uint256 the truncated report.
    function truncateTiersAbove(uint256 report_, uint256 tierInt_)
        internal
        pure
        returns (uint256)
    {
        uint256 _offset = tierInt_ * 32;
        uint256 _mask = (UNINITIALIZED >> _offset) << _offset;
        return report_ | _mask;
    }

    /// Updates a report with a block number for every status integer in a range.
    ///
    /// Does nothing if the end status is equal or less than the start status.
    /// @param report_ The report to update.
    /// @param startTierInt_ The tierInt_ at the start of the range (exclusive).
    /// @param endTierInt_ The tierInt_ at the end of the range (inclusive).
    /// @param blockNumber_ The block number to set for every status in the range.
    /// @return The updated report.
    function updateBlocksForTierRange(
        uint256 report_,
        uint256 startTierInt_,
        uint256 endTierInt_,
        uint256 blockNumber_
    )
        internal pure returns (uint256)
    {
        for (uint256 i = startTierInt_; i < endTierInt_; i++) {
            report_ = (report_ & ~uint256(uint256(uint32(UNINITIALIZED)) << i*32)) | uint256(blockNumber_ << (i*32));
        }
        return report_;
    }

    /// Updates a report to a new status.
    ///
    /// Internally dispatches to `truncateStatusesAbove` and `updateBlocksForStatuRange`.
    /// The dispatch is based on whether the new status is above or below the current status.
    /// The `current_tierInt` MUST match the result of `statusAtFromReport`.
    /// It is expected the caller will know the current status when calling this function
    /// and need to do other things in the calling scope with it.
    /// @param report_ The report to update.
    /// @param currentTierInt_ The current status int according to the report.
    /// @param newTierInt_ The new status for the report.
    /// @param blockNumber_ The block number to update the status at.
    /// @return The updated report.
    function updateReportWithTierAtBlock(
        uint256 report_,
        uint256 currentTierInt_,
        uint256 newTierInt_,
        uint256 blockNumber_
    )
        internal pure returns (uint256)
    {
        // Truncate above the new status if it is lower than the current one.
        if (newTierInt_ < currentTierInt_) {
            return truncateTiersAbove(report_, newTierInt_);
        }
        // Otherwise fill the gap between current and new with the block number.
        else {
            return updateBlocksForTierRange(
                report_,
                currentTierInt_,
                newTierInt_,
                blockNumber_
            );
        }
    }

}