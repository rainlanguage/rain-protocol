// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./ReadOnlyTier.sol";
import "../verify/libraries/VerifyConstants.sol";
import {State, Verify} from "../verify/Verify.sol";
import "./libraries/TierReport.sol";

/// @title VerifyTier
///
/// @dev A contract that is `VerifyTier` expects to derive tiers from the time
/// the account was approved by the underlying `Verify` contract. The approval
/// block numbers defer to `State.since` returned from `Verify.state`.
contract VerifyTier is ReadOnlyTier, Initializable {
    /// Result of initializing.
    /// @param sender `msg.sender` that initialized the contract.
    /// @param verify The `Verify` contract checked for reports.ww
    event Initialize(address sender, address verify);
    /// The contract to check to produce reports.
    Verify private verify;

    /// Sets the `verify` contract.
    /// @param verify_ The contract to check to produce reports.
    function initialize(address verify_) external initializer {
        require(verify_ != address(0), "0_ADDRESS");
        verify = Verify(verify_);
        emit Initialize(msg.sender, verify_);
    }

    /// Every tier will be the `State.since` block if `account_` is approved
    /// otherwise every tier will be uninitialized.
    /// @inheritdoc ITier
    function report(address account_) public view override returns (uint256) {
        State memory state_ = verify.state(account_);
        if (
            // This is comparing an enum variant so it must be equal.
            // slither-disable-next-line incorrect-equality
            verify.statusAtBlock(state_, block.number) ==
            VerifyConstants.STATUS_APPROVED
        ) {
            return
                TierReport.updateBlocksForTierRange(
                    TierConstants.NEVER_REPORT,
                    TierConstants.TIER_ZERO,
                    TierConstants.TIER_EIGHT,
                    state_.approvedSince
                );
        } else {
            return TierConstants.NEVER_REPORT;
        }
    }
}
