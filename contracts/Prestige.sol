// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "./IPrestige.sol";
import { PrestigeUtil } from "./PrestigeUtil.sol";

contract Prestige is IPrestige {
    mapping(address => uint256) public statuses;

    /**
     * Implements IPrestige.
     *
     * Either fetch the report from storage or return UNINITIALIZED.
     */
    function statusReport(address account)
        public
        virtual
        override
        view
        returns (uint256)
    {
        uint256 report = statuses[account];
        return report == 0 ? PrestigeUtil.UNINITIALIZED : report;
    }

    /**
     * Implements IPrestige.
     *
     * Errors if the user attempts to return to the NIL status.
     * Updates the status report from `statusReport` using default `PrestigeUtil` logic.
     * Calls `_afterSetStatus` that inheriting contracts SHOULD override to enforce status requirements.
     * Emits `StatusChange` event.
     */
    function setStatus(address account, Status newStatus, bytes memory data) external virtual override {
        // The user must move to at least COPPER.
        // The NIL status is reserved for users that have never interacted with the contract.
        require(newStatus != Status.NIL, "ERR_NIL_STATUS");

        uint256 report = statusReport(account);

        IPrestige.Status currentStatus = PrestigeUtil.statusAtFromReport(report, block.number);

        statuses[account] = PrestigeUtil.updateReportWithStatusAtBlock(
            report,
            uint256(currentStatus),
            uint256(newStatus),
            block.number
        );

        // Last thing to do as checks-effects-interactions.
        // Call the _afterSetStatus hook to allow "real" prestige contracts to enforce requirements.
        // The prestige contract MUST require its needs to rollback the status change.
        _afterSetStatus(account, currentStatus, newStatus, data);

        // Emit this event for IPrestige.
        emit StatusChange(account, [currentStatus, newStatus]);
    }

    /**
     * Inheriting contracts SHOULD override this to enforce status requirements.
     *
     * All the internal accounting and state changes are complete at this point.
     * Use `require` to enforce additional requirements for status changes.
     *
     * @param account The account with the new status.
     * @param oldStatus The status the account had before this update.
     * @param newStatus The status the account will have after this update.
     * @param data Additional arbitrary data to inform status update requirements.
     */
    function _afterSetStatus(address account, Status oldStatus, Status newStatus, bytes memory data) internal virtual { } // solhint-disable-line no-empty-blocks
}