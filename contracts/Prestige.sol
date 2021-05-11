// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { IPrestige } from "./IPrestige.sol";
import { PrestigeUtil } from "./PrestigeUtil.sol";

import { console } from "hardhat/console.sol";

contract Prestige is IPrestige {
    mapping(address => uint256) public statuses;

    uint256 constant public UNINITIALIZED = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    /// Return status report
    /// @param account - Account to be reported on.
    /// @return uint256 the block number that corresponds to the current status report.
    function statusReport(address account)
        public
        override
        view
        returns (uint256)
    {
        uint256 report = statuses[account];
        return report == 0 ? UNINITIALIZED : report;
    }

    function setStatus(address account, Status newStatus, bytes memory data) external override {
        // The user must move to at least COPPER.
        // The NIL status is reserved for users that have never interacted with the contract.
        require(newStatus != Status.NIL, "ERR_NIL_STATUS");

        uint256 _report = statusReport(account);

        Status currentStatus = PrestigeUtil.statusAtFromReport(_report, uint32(block.number));

        if (_report == UNINITIALIZED) {
            _report = (_report ^ uint32(UNINITIALIZED)) | block.number;
        }

        console.log("setStatus: _report: %s", _report);

        uint256 _currentStatusInt = uint256(currentStatus);
        uint256 _newStatusInt = uint256(newStatus);

        console.log("setStatus: status ints: %s %s", _currentStatusInt, _newStatusInt);

        // Truncate above the new status.
        _report = _truncateStatusesAbove(_report, _newStatusInt);

        console.log("setStatus: truncated _report %s", _report);

        // Anything between the current/new statuses needs the current block number.
        for (uint256 i = _currentStatusInt; i < _newStatusInt; i++) {
            _report = (_report ^ uint256(uint256(uint32(UNINITIALIZED)) << i*32)) | uint256(block.number << (i*32));
        }
        console.log("setStatus: filled _report %s", _report);

        statuses[account] = _report;

        _afterSetStatus(account, currentStatus, newStatus, data);

        // Emit this event for IPrestige.
        emit StatusChange(account, [currentStatus, newStatus]);
    }

    function _afterSetStatus(address account, Status oldStatus, Status newStatus, bytes memory data) internal virtual { }

    /// Return maxes out all the statuses above the provided status.
    /// @param report - Status report to truncate with high bit ones
    /// @param status - Status level to truncate above (exclusive)
    /// @return uint256 the truncated report.
    function _truncateStatusesAbove(uint256 report, uint256 status)
        private
        pure
        returns (uint256)
    {
        uint256 _offset = uint256(status) * 32;
        uint256 _mask = (UNINITIALIZED >> _offset) << _offset;
        return report | _mask;
    }
}