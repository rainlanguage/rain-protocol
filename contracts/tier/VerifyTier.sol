// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./TierV2.sol";
import "../verify/libraries/VerifyConstants.sol";
import {State, Verify} from "../verify/Verify.sol";
import "./libraries/TierReport.sol";

/// @title VerifyTier
///
/// @dev A contract that is `VerifyTier` expects to derive tiers from the time
/// the account was approved by the underlying `Verify` contract. The approval
/// timestamps defer to `State.since` returned from `Verify.state`.
contract VerifyTier is TierV2 {
    /// Result of initializing.
    /// @param sender `msg.sender` that initialized the contract.
    /// @param verify The `Verify` contract checked for reports.
    event Initialize(address sender, address verify);
    /// The contract to check to produce reports.
    Verify private verify;

    constructor() {
        _disableInitializers();
    }

    /// Sets the `verify` contract.
    /// @param verify_ The contract to check to produce reports.
    function initialize(address verify_) external initializer {
        require(verify_ != address(0), "0_ADDRESS");
        verify = Verify(verify_);
        emit Initialize(msg.sender, verify_);
    }

    /// Every tier will be the `State.since` timestamp if `account_` is
    /// approved otherwise every tier will be uninitialized.
    /// @inheritdoc ITierV2
    function report(address account_, uint256[] memory)
        public
        view
        override
        returns (uint256)
    {
        State memory state_ = verify.state(account_);
        if (
            // This is comparing an enum variant so it must be equal.
            // slither-disable-next-line incorrect-equality
            verify.statusAtTime(state_, block.timestamp) ==
            VerifyConstants.STATUS_APPROVED
        ) {
            return
                TierReport.updateTimesForTierRange(
                    TierConstants.NEVER_REPORT,
                    TierConstants.TIER_ZERO,
                    TierConstants.TIER_EIGHT,
                    state_.approvedSince
                );
        } else {
            return TierConstants.NEVER_REPORT;
        }
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256,
        uint256[] calldata
    ) external view returns (uint256) {
        State memory state_ = verify.state(account_);
        if (
            // This is comparing an enum variant so it must be equal.
            // slither-disable-next-line incorrect-equality
            verify.statusAtTime(state_, block.timestamp) ==
            VerifyConstants.STATUS_APPROVED
        ) {
            return state_.approvedSince;
        } else {
            return TierConstants.NEVER_REPORT;
        }
    }
}
