// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { ITier } from "../tier/ITier.sol";

/// @title TierUtil
/// Utilities to consistently read, write and manipulate tiers in reports.
/// The low-level bit shifting can be difficult to get right so this factors that out.
library TierUtil {

    /// UNINITIALIZED report is 0xFF.. as no tier has been held.
    uint256 constant public UNINITIALIZED = uint256(-1);

    /// Returns the highest tier achieved relative to a block number and report.
    ///
    /// Note that typically the report will be from the _current_ contract state.
    /// When the `report` comes from a later block than the `blockNumber` this means
    /// the user must have held the tier continuously from `blockNumber` _through_ to the report block.
    /// I.e. NOT a snapshot.
    /// @param report_ A report as per `ITier`.
    /// @param blockNumber_ The block number to check the tiers against.
    /// @return The highest tier held since `blockNumber` according to `report`.
    function tierAtBlockFromReport(
        uint256 report_,
        uint256 blockNumber_
    )
        internal pure returns (ITier.Tier)
    {
        for (uint256 i_ = 0; i_ < 8; i_++) {
            if (uint32(uint256(report_ >> (i_*32))) > uint32(blockNumber_)) {
                return ITier.Tier(i_);
            }
        }
        return ITier.Tier(8);
    }

    /// Returns the block that a given tier has been held since according to a report.
    ///
    /// The report SHOULD encode "never" as 0xFFFFFFFF.
    /// @param report_ The report to read a block number from.
    /// @param tier_ The Tier to read the block number for.
    /// @return The block number this has been held since.
    function tierBlock(uint256 report_, ITier.Tier tier_)
        internal
        pure
        returns (uint256)
    {
        // ZERO is a special case. Everyone has always been at least ZERO, since block 0.
        if (tier_ == ITier.Tier.ZERO) { return 0; }

        uint256 offset_ = (uint256(tier_) - 1) * 32;
        return uint256(uint32(
            uint256(
                report_ >> offset_
            )
        ));
    }

    /// Resets all the tiers above the reference tier to 0xFFFFFFFF.
    ///
    /// @param report_ Report to truncate with high bit 1s.
    /// @param tier_ Tier to truncate above (exclusive).
    /// @return Truncated report.
    function truncateTiersAbove(uint256 report_, ITier.Tier tier_)
        internal
        pure
        returns (uint256)
    {
        uint256 offset_ = uint256(tier_) * 32;
        uint256 mask_ = (UNINITIALIZED >> offset_) << offset_;
        return report_ | mask_;
    }

    /// Updates a report with a block number for every status integer in a range.
    ///
    /// Does nothing if the end status is equal or less than the start status.
    /// @param report_ The report to update.
    /// @param startTier_ The tierInt_ at the start of the range (exclusive).
    /// @param endTier_ The tierInt_ at the end of the range (inclusive).
    /// @param blockNumber_ The block number to set for every status in the range.
    /// @return The updated report.
    function updateBlocksForTierRange(
        uint256 report_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    )
        internal pure returns (uint256)
    {
        uint256 offset_;
        for (uint256 i_ = uint256(startTier_); i_ < uint256(endTier_); i_++) {
            offset_ = i_ * 32;
            report_ = (report_ & ~uint256(uint256(uint32(UNINITIALIZED)) << offset_)) | uint256(blockNumber_ << offset_);
        }
        return report_;
    }

    /// Updates a report to a new status.
    ///
    /// Internally dispatches to `truncateTiersAbove` and `updateBlocksForTierRange`.
    /// The dispatch is based on whether the new tier is above or below the current tier.
    /// The `startTier_` MUST match the result of `tierAtBlockFromReport`.
    /// It is expected the caller will know the current tier when calling this function
    /// and need to do other things in the calling scope with it.
    /// @param report_ The report to update.
    /// @param startTier_ The current tier according to the report.
    /// @param endTier_ The new tier for the report.
    /// @param blockNumber_ The block number to update the tier at.
    /// @return The updated report.
    function updateReportWithTierAtBlock(
        uint256 report_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    )
        internal pure returns (uint256)
    {
        return endTier_ < startTier_ ? truncateTiersAbove(report_, endTier_) : updateBlocksForTierRange(report_, startTier_, endTier_, blockNumber_);
    }

}