// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "./IPrestige.sol";

library PrestigeUtil {

    uint256 constant public UNINITIALIZED = uint256(-1);

    // Returns the highest status achieved relative to a block number and status report.
    // Note that typically the statusReport will be from the _current_ contract state.
    // When the `statusReport` comes from a later block than the `blockNumber` this means
    // the user must have held the status continuously from `blockNumber` _through_ to the report block.
    // I.e. NOT a snapshot.
    function statusAtFromReport(uint256 statusReport, uint32 blockNumber) internal pure returns (IPrestige.Status) {
        for (uint256 i = 0; i < 8; i++) {
            if (uint32(uint256(statusReport >> (i*32))) > blockNumber) {
                return IPrestige.Status(i);
            }
        }
        return IPrestige.Status(8);
    }

    // Returns the block that a given status has been held since.
    // Returns 0xffffffff if a status has never been held.
    function statusBlock(uint256 statusReport, IPrestige.Status status) internal pure returns (uint32) {
        uint256 _statusInt = uint256(status);
        // NIL is a special case. Everyone has always been at least NIL, since block 0.
        if (_statusInt == 0) {
            return 0;
        } else {
            uint256 offset = (uint256(status) - 1) * 32;
            return uint32(
                uint256(
                    statusReport >> offset
                )
            );
        }
    }

    /// Return maxes out all the statuses above the provided status.
    /// @param report - Status report to truncate with high bit ones
    /// @param status - Status level to truncate above (exclusive)
    /// @return uint256 the truncated report.
    function _truncateStatusesAbove(uint256 report, uint256 status)
        internal
        pure
        returns (uint256)
    {
        uint256 _offset = uint256(status) * 32;
        uint256 _mask = (UNINITIALIZED >> _offset) << _offset;
        return report | _mask;
    }

}