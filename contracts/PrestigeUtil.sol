// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "./IPrestige.sol";

library PrestigeUtil {

    uint256 constant public UNINITIALIZED = uint256(-1);

    /**
     * Returns the highest status achieved relative to a block number and status report.
     *
     * Note that typically the statusReport will be from the _current_ contract state.
     * When the `statusReport` comes from a later block than the `blockNumber` this means
     * the user must have held the status continuously from `blockNumber` _through_ to the report block.
     * I.e. NOT a snapshot.
     * @param report A status report as per IPrestige
     * @param blockNumber The block number check the statuses against.
     * @return The highest status held since `blockNumber` according to `report`.
     */
    function statusAtFromReport(uint256 report, uint256 blockNumber) internal pure returns (IPrestige.Status) {
        for (uint256 i = 0; i < 8; i++) {
            if (uint32(uint256(report >> (i*32))) > uint32(blockNumber)) {
                return IPrestige.Status(i);
            }
        }
        return IPrestige.Status(8);
    }

    /**
     * Returns the block that a given status has been held since according to a status report.
     *
     * The status report SHOULD encode "never" as 0xFFFFFFFF
     * @param report The status report to read a block number from.
     * @param statusInt The status integer to read the block number for.
     * @return The block number this status has been held since.
     */
    function statusBlock(uint256 report, uint256 statusInt)
        internal
        pure
        returns (uint256)
    {
        // NIL is a special case. Everyone has always been at least NIL, since block 0.
        if (statusInt == 0) {
            return 0;
        } else {
            uint256 offset = (statusInt - 1) * 32;
            return uint256(uint32(
                uint256(
                    report >> offset
                )
            ));
        }
    }

    /**
     * Resets all the statuses above the reference status.
     *
     * @param report Status report to truncate with high bit 1s.
     * @param statusInt Status int level to truncate above (exclusive).
     * @return uint256 the truncated report.
     */
    function truncateStatusesAbove(uint256 report, uint256 statusInt)
        internal
        pure
        returns (uint256)
    {
        uint256 _offset = statusInt * 32;
        uint256 _mask = (UNINITIALIZED >> _offset) << _offset;
        return report | _mask;
    }

    /**
     * Updates a report with a block number for every status integer in a range.
     *
     * Does nothing if the end status is equal or less than the start status.
     * @param report The report to update.
     * @param startStatusInt The statusInt at the start of the range (exclusive).
     * @param endStatusInt The statusInt at the end of the range (inclusive).
     * @param blockNumber The block number to set for every status in the range.
     * @return The updated report.
     */
    function updateBlocksForStatusRange(uint256 report, uint256 startStatusInt, uint256 endStatusInt, uint256 blockNumber) internal pure returns (uint256) {
        for (uint256 i = startStatusInt; i < endStatusInt; i++) {
            report = (report & ~uint256(uint256(uint32(PrestigeUtil.UNINITIALIZED)) << i*32)) | uint256(blockNumber << (i*32));
        }
        return report;
    }

    /**
     * Updates a report to a new status.
     *
     * Internally dispatches to `truncateStatusesAbove` and `updateBlocksForStatuRange`.
     * The dispatch is based on whether the new status is above or below the current status.
     * The `currentStatusInt` MUST match the result of `statusAtFromReport`.
     * It is expected the caller will know the current status when calling this function
     * and need to do other things in the calling scope with it.
     * @param report The report to update.
     * @param currentStatusInt The current status int according to the report.
     * @param newStatusInt The new status for the report.
     * @param blockNumber The block number to update the status at.
     * @return The updated report.
     */
    function updateReportWithStatusAtBlock(uint256 report, uint256 currentStatusInt, uint256 newStatusInt, uint256 blockNumber) internal pure returns (uint256) {
        // Truncate above the new status if it is lower than the current one.
        if (newStatusInt < currentStatusInt) {
            report = truncateStatusesAbove(report, newStatusInt);
        }
        // Otherwise fill the gap between current and new with the block number.
        else {
            report = updateBlocksForStatusRange(report, currentStatusInt, newStatusInt, blockNumber);
        }
        return report;
    }

}