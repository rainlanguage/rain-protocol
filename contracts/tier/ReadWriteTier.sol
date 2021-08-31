// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";
import { TierUtil } from "../libraries/TierUtil.sol";

/// @title ReadWriteTier
///
/// ReadWriteTier can `setTier` in addition to generating reports.
/// When `setTier` is called it automatically sets the current blocks in the report for the new tiers.
/// Lost tiers are scrubbed from the report as tiered addresses move down the tiers.
contract ReadWriteTier is ITier {
    /// account => reports
    mapping(address => uint256) public reports;

    /// Either fetch the report from storage or return UNINITIALIZED.
    /// @inheritdoc ITier
    function report(address account_)
        public
        virtual
        override
        view
        returns (uint256)
    {
        // Inequality here to silence slither warnings.
        return reports[account_] > 0 ? reports[account_] : TierUtil.UNINITIALIZED;
    }

    /// Errors if the user attempts to return to the ZERO tier.
    /// Updates the report from `report` using default `TierUtil` logic.
    /// Calls `_afterSetTier` that inheriting contracts SHOULD override to enforce status requirements.
    /// Emits `TierChange` event.
    /// @inheritdoc ITier
    function setTier(
        address account_,
        Tier endTier_,
        bytes memory data_
    )
        external virtual override
    {
        // The user must move to at least ONE.
        // The ZERO status is reserved for users that have never interacted with the contract.
        require(endTier_ != Tier.ZERO, "SET_ZERO_TIER");

        uint256 report_ = report(account_);

        ITier.Tier startTier_ = TierUtil.tierAtBlockFromReport(report_, block.number);

        reports[account_] = TierUtil.updateReportWithTierAtBlock(
            report_,
            startTier_,
            endTier_,
            block.number
        );

        // Emit this event for ITier.
        emit TierChange(account_, startTier_, endTier_);

        // Call the _afterSetTier hook to allow inheriting contracts to enforce requirements.
        // The inheriting contract MUST `require` or otherwise enforce its needs to rollback a bad status change.
        _afterSetTier(account_, startTier_, endTier_, data_);
    }

    /// Inheriting contracts SHOULD override this to enforce requirements.
    ///
    /// All the internal accounting and state changes are complete at this point.
    /// Use `require` to enforce additional requirements for tier changes.
    ///
    /// @param account_ The account with the new tier.
    /// @param startTier_ The tier the account had before this update.
    /// @param endTier_ The tier the account will have after this update.
    /// @param data_ Additional arbitrary data to inform update requirements.
    function _afterSetTier(
        address account_,
        Tier startTier_,
        Tier endTier_,
        bytes memory data_
    )
        internal virtual
    { } // solhint-disable-line no-empty-blocks
}