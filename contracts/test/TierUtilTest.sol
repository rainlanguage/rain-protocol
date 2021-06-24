// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import {ITier} from "../tier/ITier.sol";
import {TierUtil} from "../libraries/TierUtil.sol";

contract TierUtilTest {
    function tierAtBlockFromReport(uint256 statusReport_, uint256 blockNumber_)
        external
        pure
        returns (ITier.Tier)
    {
        return TierUtil.tierAtBlockFromReport(statusReport_, blockNumber_);
    }

    function tierBlock(uint256 report_, ITier.Tier tier_)
        external
        pure
        returns (uint256)
    {
        return TierUtil.tierBlock(report_, tier_);
    }

    function truncateTiersAbove(uint256 statusReport_, ITier.Tier tier_)
        external
        pure
        returns (uint256)
    {
        return TierUtil.truncateTiersAbove(statusReport_, tier_);
    }

    function updateBlocksForTierRange(
        uint256 statusReport_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierUtil.updateBlocksForTierRange(
                statusReport_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }

    function updateReportWithTierAtBlock(
        uint256 statusReport_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        uint256 blockNumber_
    ) external pure returns (uint256) {
        return
            TierUtil.updateReportWithTierAtBlock(
                statusReport_,
                startTier_,
                endTier_,
                blockNumber_
            );
    }
}
