// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import {ITier} from "../tier/ITier.sol";
import {TierUtil} from "../libraries/TierUtil.sol";

/// @title TierUtilTest
/// Thin wrapper around the `TierUtil` library to facilitate hardhat unit testing.
contract TierUtilTest {
    /// Wraps `TierUtil.tierAtBlockFromReport`.
    /// @param report_ Forwarded to TierUtil.
    /// @param blockNumber_ Forwarded to TierUtil.
    function tierAtBlockFromReport(uint256 report_, uint256 blockNumber_)
        external
        pure
        returns (ITier.Tier)
    {
        return TierUtil.tierAtBlockFromReport(report_, blockNumber_);
    }

    /// Wraps `TierUtil.tierBlock`.
    /// @param report_ Forwarded to TierUtil.
    /// @param tier_ Forwarded to TierUtil.
    function tierBlock(uint256 report_, ITier.Tier tier_)
        external
        pure
        returns (uint256)
    {
        return TierUtil.tierBlock(report_, tier_);
    }

    /// Wraps `TierUtil.truncateTiersAbove`.
    /// @param report_ Forwarded to TierUtil.
    /// @param tier_ Forwarded to TierUtil.
    function truncateTiersAbove(uint256 report_, ITier.Tier tier_)
        external
        pure
        returns (uint256)
    {
        return TierUtil.truncateTiersAbove(report_, tier_);
    }

    /// Wraps `TierUtil.updateBlocksForTierRange`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param blockNumber_ Forwarded to TestUtil.
    function updateBlocksForTierRange(
        uint256 report_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierUtil.updateBlocksForTierRange(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }

    /// Wraps `TierUtil.updateReportWithTierAtBlock`.
    /// @param report_ Forwarded to TestUtil.
    /// @param startTier_ Forwarded to TestUtil.
    /// @param endTier_ Forwarded to TestUtil.
    /// @param blockNumber_ Forwarded to TestUtil.
    function updateReportWithTierAtBlock(
        uint256 report_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierUtil.updateReportWithTierAtBlock(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }
}
