// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";
import { TierUtil } from "./TierUtil.sol";

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
        uint256 report_ = reports[account_];
        // Inequality here to silence slither warnings.
        return report_ > 0 ? report_ : TierUtil.UNINITIALIZED;
    }

    /// Errors if the user attempts to return to the NIL tier.
    /// Updates the report from `report` using default `TierUtil` logic.
    /// Calls `_afterSetTier` that inheriting contracts SHOULD override to enforce status requirements.
    /// Emits `TierChange` event.
    /// @inheritdoc ITier
    function setTier(
        address account_,
        Tier newTier_,
        bytes memory data_
    )
        external virtual override
    {
        // The user must move to at least ONE.
        // The ZERO status is reserved for users that have never interacted with the contract.
        require(newTier_ != Tier.ZERO, "SET_ZERO_TIER");

        uint256 _report = report(account_);

        ITier.Tier _currentTier = TierUtil.tierAtBlockFromReport(_report, block.number);

        reports[account_] = TierUtil.updateReportWithTierAtBlock(
            _report,
            uint256(_currentTier),
            uint256(newTier_),
            block.number
        );

        // Last thing to do as checks-effects-interactions.
        // Call the _afterSetTier hook to allow inheriting contracts to enforce requirements.
        // The inheriting contract MUST require its needs to rollback the status change.
        _afterSetTier(account_, _currentTier, newTier_, data_);

        // Emit this event for ITier
        emit TierChange(account_, _currentTier, newTier_);
    }

    /// Inheriting contracts SHOULD override this to enforce requirements.
    ///
    /// All the internal accounting and state changes are complete at this point.
    /// Use `require` to enforce additional requirements for tier changes.
    ///
    /// @param _account The account with the new tier.
    /// @param _oldTier The tier the account had before this update.
    /// @param _newTier The tier the account will have after this update.
    /// @param _data Additional arbitrary data to inform update requirements.
    function _afterSetTier(
        address _account,
        Tier _oldTier,
        Tier _newTier,
        bytes memory _data
    )
        internal virtual
    { } // solhint-disable-line no-empty-blocks
}