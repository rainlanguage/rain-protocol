// SPDX-License-Identifier: CAL
pragma solidity 0.8.10;

import {ITier} from "../tier/ITier.sol";
import {TierReport} from "../tier/libraries/TierReport.sol";

/// @title TierReportTest
/// Thin wrapper around the `TierReport` library for hardhat unit testing.
contract TierReportTest {
    /// Wraps `TierReport.tierAtBlockFromReport`.
    /// @param report_ Forwarded to TierReport.
    /// @param blockNumber_ Forwarded to TierReport.
    function tierAtBlockFromReport(uint256 report_, uint256 blockNumber_)
        external
        pure
        returns (uint256)
    {
        return TierReport.tierAtBlockFromReport(report_, blockNumber_);
    }

    /// Wraps `TierReport.tierBlock`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function tierBlock(uint256 report_, uint256 tier_)
        external
        pure
        returns (uint256)
    {
        return TierReport.tierBlock(report_, tier_);
    }

    /// Wraps `TierReport.truncateTiersAbove`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function truncateTiersAbove(uint256 report_, uint256 tier_)
        external
        pure
        returns (uint256)
    {
        return TierReport.truncateTiersAbove(report_, tier_);
    }

    /// Wraps `TierReport.updateBlocksForTierRange`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param blockNumber_ Forwarded to TestUtil.
    function updateBlocksForTierRange(
        uint256 report_,
        uint256 startTier_,
        uint256 endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierReport.updateBlocksForTierRange(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }

    /// Wraps `TierReport.updateReportWithTierAtBlock`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param blockNumber_ Forwarded to TestUtil.
    function updateReportWithTierAtBlock(
        uint256 report_,
        uint256 startTier_,
        uint256 endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierReport.updateReportWithTierAtBlock(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }
}
