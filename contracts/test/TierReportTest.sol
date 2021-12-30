// SPDX-License-Identifier: CAL
pragma solidity 0.8.10;

import { ITier } from "../tier/ITier.sol";
import { TierReport } from "../tier/libraries/TierReport.sol";

/// @title TierReportTest
/// Thin wrapper around the `TierReport` library for hardhat unit testing.
contract TierReportTest {
    /// Wraps `TierReport.tierAtBlockFromReport`.
    /// @param report_ Forwarded to TierReport.
    /// @param blockNumber_ Forwarded to TierReport.
    function tierAtBlockFromReport(uint report_, uint blockNumber_)
        external
        pure
        returns (uint)
    {
        return TierReport.tierAtBlockFromReport(report_, blockNumber_);
    }

    /// Wraps `TierReport.tierBlock`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function tierBlock(uint report_, uint tier_)
        external
        pure
        returns (uint)
    {
        return TierReport.tierBlock(report_, tier_);
    }

    /// Wraps `TierReport.truncateTiersAbove`.
    /// @param report_ Forwarded to TierReport.
    /// @param tier_ Forwarded to TierReport.
    function truncateTiersAbove(uint report_, uint tier_)
        external
        pure
        returns (uint)
    {
        return TierReport.truncateTiersAbove(report_, tier_);
    }

    /// Wraps `TierReport.updateBlocksForTierRange`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param blockNumber_ Forwarded to TestUtil.
    function updateBlocksForTierRange(
        uint report_,
        uint startTier_,
        uint endTier_,
        uint blockNumber_
    ) external pure returns (uint) {
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
        uint report_,
        uint startTier_,
        uint endTier_,
        uint blockNumber_
    ) external pure returns (uint) {
        return
            TierReport.updateReportWithTierAtBlock(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }
}
