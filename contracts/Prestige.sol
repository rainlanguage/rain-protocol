// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "./IPrestige.sol";
import { PrestigeUtil } from "./PrestigeUtil.sol";

contract Prestige is IPrestige {
    mapping(address => uint256) public statuses;

    uint256 constant public UNINITIALIZED = uint256(-1);

    /// Return status report
    /// @param account - Account to be reported on.
    /// @return uint256 the block number that corresponds to the current status report.
    function statusReport(address account)
        public
        virtual
        override
        view
        returns (uint256)
    {
        uint256 report = statuses[account];
        return report == 0 ? UNINITIALIZED : report;
    }

    function setStatus(address account, Status newStatus, bytes memory data) external virtual override {
        // The user must move to at least COPPER.
        // The NIL status is reserved for users that have never interacted with the contract.
        require(newStatus != Status.NIL, "ERR_NIL_STATUS");

        uint256 _report = statusReport(account);

        Status currentStatus = PrestigeUtil.statusAtFromReport(_report, uint32(block.number));

        uint256 _currentStatusInt = uint256(currentStatus);
        uint256 _newStatusInt = uint256(newStatus);

        // Truncate above the new status.
        _report = _truncateStatusesAbove(_report, _newStatusInt);

        // Anything between the current/new statuses needs the current block number.
        for (uint256 i = _currentStatusInt; i < _newStatusInt; i++) {
            _report = (_report ^ uint256(uint256(uint32(UNINITIALIZED)) << i*32)) | uint256(block.number << (i*32));
        }

        statuses[account] = _report;

        // Last thing to do as checks-effects-interactions.
        // Call the _afterSetStatus hook to allow "real" prestige contracts to enforce requirements.
        // The prestige contract MUST require its needs to rollback the status change.
        _afterSetStatus(account, currentStatus, newStatus, data);

        // Emit this event for IPrestige.
        emit StatusChange(account, [currentStatus, newStatus]);
    }

    function _afterSetStatus(address account, Status oldStatus, Status newStatus, bytes memory data) internal virtual { } // solhint-disable-line no-empty-blocks

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