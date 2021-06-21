// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import {ITier} from "../tier/ITier.sol";
import {TierUtil} from "../tier/TierUtil.sol";

contract TierUtilTest {
    function tierAtBlockFromReport(uint256 _statusReport, uint256 _blockNumber)
        external
        pure
        returns (ITier.Tier)
    {
        return TierUtil.tierAtBlockFromReport(_statusReport, _blockNumber);
    }

    function tierBlock(uint256 _report, uint256 _tierInt)
        external
        pure
        returns (uint256)
    {
        return TierUtil.tierBlock(_report, _tierInt);
    }

    function truncateTiersAbove(uint256 _statusReport, uint256 _tierInt)
        external
        pure
        returns (uint256)
    {
        return TierUtil.truncateTiersAbove(_statusReport, _tierInt);
    }

    function updateBlocksForTierRange(
        uint256 _statusReport,
        uint256 _startTierInt,
        uint256 _endTierInt,
        uint256 _blockNumber
    ) external pure returns (uint256) {
        return
            TierUtil.updateBlocksForTierRange(
                _statusReport,
                _startTierInt,
                _endTierInt,
                _blockNumber
            );
    }

    function updateReportWithTierAtBlock(
        uint256 _statusReport,
        uint256 _currentTierInt,
        uint256 _newTierInt,
        uint256 _blockNumber
    ) external pure returns (uint256) {
        return
            TierUtil.updateReportWithTierAtBlock(
                _statusReport,
                _currentTierInt,
                _newTierInt,
                _blockNumber
            );
    }
}
