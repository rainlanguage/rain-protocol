// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IStatus } from "./IStatus.sol";
import { StatusUtil } from "./StatusUtil.sol";

contract Status is IStatus {
    // id => account => statusReport
    mapping(uint256 => mapping(address => uint256)) public statuses;

    /**
     * Implements IPrestige.
     *
     * Either fetch the report from storage or return UNINITIALIZED.
     */
    function statusReport(uint256 _id, address _account)
        public
        virtual
        override
        view
        returns (uint256)
    {
        uint256 _report = statuses[_id][_account];
        // Inequality here to silence slither warnings.
        return _report > 0 ? _report : PrestigeUtil.UNINITIALIZED;
    }

    /**
     * Implements IPrestige.
     *
     * Errors if the user attempts to return to the NIL status.
     * Updates the status report from `statusReport` using default `PrestigeUtil` logic.
     * Calls `_afterSetStatus` that inheriting contracts SHOULD override to enforce status requirements.
     * Emits `StatusChange` event.
     */
    function setStatus(
        uint256 _id,
        address _account,
        Tier _newTier,
        bytes memory _data
    )
        external virtual override
    {
        // The user must move to at least ONE.
        // The ZERO status is reserved for users that have never interacted with the contract.
        require(_newTier != Tier.ZERO, "ERR_ZERO_STATUS");

        uint256 _report = statusReport(account);

        IStatus.Tier _currentTier = StatusUtil.tierAtBlockFromReport(_report, block.number);

        statuses[_id][_account] = StatusUtil.updateReportWithTierAtBlock(
            _report,
            uint256(_currentTier),
            uint256(_newTier),
            block.number
        );

        // Last thing to do as checks-effects-interactions.
        // Call the _afterSetStatus hook to allow "real" prestige contracts to enforce requirements.
        // The prestige contract MUST require its needs to rollback the status change.
        _afterSetStatus(_account, _currentTier, _newTier, _data);

        // Emit this event for IStatus
        emit StatusChange(_id, _account, [_currentTier, _newTier]);
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
    //slither-disable-next-line dead-code
    function _afterSetStatus(
        address _account,
        Tier _oldTier,
        Tier _newTier,
        bytes memory _data
    )
        internal virtual
    { } // solhint-disable-line no-empty-blocks
}