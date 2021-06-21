// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ITier } from "./ITier.sol";

library TierUtil {

    uint256 constant public UNINITIALIZED = uint256(-1);

    /// Returns the highest status achieved relative to a block number and status report.
    ///
    /// Note that typically the statusReport will be from the _current_ contract state.
    /// When the `statusReport` comes from a later block than the `blockNumber` this means
    /// the user must have held the status continuously from `blockNumber` _through_ to the report block.
    /// I.e. NOT a snapshot.
    /// @param _report A status report as per ITier
    /// @param _blockNumber The block number check the statuses against.
    /// @return The highest status held since `blockNumber` according to `report`.
    function tierAtBlockFromReport(
        uint256 _report,
        uint256 _blockNumber
    )
        internal pure returns (ITier.Tier)
    {
        for (uint256 i = 0; i < 8; i++) {
            if (uint32(uint256(_report >> (i*32))) > uint32(_blockNumber)) {
                return ITier.Tier(i);
            }
        }
        return ITier.Tier(8);
    }

    /// Returns the block that a given status has been held since according to a status report.
    ///
    /// The status report SHOULD encode "never" as 0xFFFFFFFF
    /// @param _report The status report to read a block number from.
    /// @param _tierInt The status integer to read the block number for.
    /// @return The block number this status has been held since.
    function tierBlock(uint256 _report, uint256 _tierInt)
        internal
        pure
        returns (uint256)
    {
        // ZERO is a special case. Everyone has always been at least ZERO, since block 0.
        if (_tierInt == 0) {
            return 0;
        } else {
            uint256 _offset = (_tierInt - 1) * 32;
            return uint256(uint32(
                uint256(
                    _report >> _offset
                )
            ));
        }
    }

    /// Resets all the tiers above the reference tier.
    ///
    /// @param _report Status report to truncate with high bit 1s.
    /// @param _tierInt Status int level to truncate above (exclusive).
    /// @return uint256 the truncated report.
    function truncateTiersAbove(uint256 _report, uint256 _tierInt)
        internal
        pure
        returns (uint256)
    {
        uint256 _offset = _tierInt * 32;
        uint256 _mask = (UNINITIALIZED >> _offset) << _offset;
        return _report | _mask;
    }

    /// Updates a report with a block number for every status integer in a range.
    ///
    /// Does nothing if the end status is equal or less than the start status.
    /// @param _report The report to update.
    /// @param _startTierInt The _tierInt at the start of the range (exclusive).
    /// @param _endTierInt The _tierInt at the end of the range (inclusive).
    /// @param _blockNumber The block number to set for every status in the range.
    /// @return The updated report.
    function updateBlocksForTierRange(
        uint256 _report,
        uint256 _startTierInt,
        uint256 _endTierInt,
        uint256 _blockNumber
    )
        internal pure returns (uint256)
    {
        for (uint256 i = _startTierInt; i < _endTierInt; i++) {
            _report = (_report & ~uint256(uint256(uint32(UNINITIALIZED)) << i*32)) | uint256(_blockNumber << (i*32));
        }
        return _report;
    }

    /// Updates a report to a new status.
    ///
    /// Internally dispatches to `truncateStatusesAbove` and `updateBlocksForStatuRange`.
    /// The dispatch is based on whether the new status is above or below the current status.
    /// The `current_tierInt` MUST match the result of `statusAtFromReport`.
    /// It is expected the caller will know the current status when calling this function
    /// and need to do other things in the calling scope with it.
    /// @param _report The report to update.
    /// @param _currentTierInt The current status int according to the report.
    /// @param _newTierInt The new status for the report.
    /// @param _blockNumber The block number to update the status at.
    /// @return The updated report.
    function updateReportWithTierAtBlock(
        uint256 _report,
        uint256 _currentTierInt,
        uint256 _newTierInt,
        uint256 _blockNumber
    )
        internal pure returns (uint256)
    {
        // Truncate above the new status if it is lower than the current one.
        if (_newTierInt < _currentTierInt) {
            return truncateTiersAbove(_report, _newTierInt);
        }
        // Otherwise fill the gap between current and new with the block number.
        else {
            return updateBlocksForTierRange(
                _report,
                _currentTierInt,
                _newTierInt,
                _blockNumber
            );
        }
    }

}