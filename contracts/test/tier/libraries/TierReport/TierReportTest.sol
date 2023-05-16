// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ITierV2} from "../../../../tier/ITierV2.sol";
import {TierReport} from "../../../../tier/libraries/TierReport.sol";

/// @title TierReportTest
/// Thin wrapper around the `TierReport` library for hardhat unit testing.
contract TierReportTest {
    /// Wraps `TierReport.tierAtTimeFromReport`.
    /// @param report_ Forwarded to TierReport.
    /// @param timestamp_ Forwarded to TierReport.
    function tierAtTimeFromReport(
        uint256 report_,
        uint256 timestamp_
    ) external pure returns (uint256) {
        unchecked {
            return TierReport.tierAtTimeFromReport(report_, timestamp_);
        }
    }

    /// Wraps `TierReport.reportForTier`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function reportTimeForTier(
        uint256 report_,
        uint256 tier_
    ) external pure returns (uint256) {
        unchecked {
            return TierReport.reportTimeForTier(report_, tier_);
        }
    }

    /// Wraps `TierReport.truncateTiersAbove`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function truncateTiersAbove(
        uint256 report_,
        uint256 tier_
    ) external pure returns (uint256) {
        unchecked {
            return TierReport.truncateTiersAbove(report_, tier_);
        }
    }

    /// Wraps `TierReport.updateTimesForTierRange`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param timestamp_ Forwarded to TestUtil.
    function updateTimesForTierRange(
        uint256 report_,
        uint256 startTier_,
        uint256 endTier_,
        uint256 timestamp_
    ) external pure returns (uint256) {
        unchecked {
            return
                TierReport.updateTimesForTierRange(
                    report_,
                    startTier_,
                    endTier_,
                    timestamp_
                );
        }
    }

    /// Wraps `TierReport.updateReportWithTierAtTime`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param timestamp_ Forwarded to TestUtil.
    function updateReportWithTierAtTime(
        uint256 report_,
        uint256 startTier_,
        uint256 endTier_,
        uint256 timestamp_
    ) external pure returns (uint256) {
        unchecked {
            return
                TierReport.updateReportWithTierAtTime(
                    report_,
                    startTier_,
                    endTier_,
                    timestamp_
                );
        }
    }

    /// Updates a report with a timestamp for a given tier.
    /// More gas efficient than `updateTimesForTierRange` if only a single
    /// tier is being modified.
    /// The tier at/above the given tier is updated. E.g. tier `0` will update
    /// the block for tier `1`.
    function updateTimeAtTier(
        uint256 report_,
        uint256 tier_,
        uint256 timestamp_
    ) external pure returns (uint256) {
        unchecked {
            return TierReport.updateTimeAtTier(report_, tier_, timestamp_);
        }
    }
}
