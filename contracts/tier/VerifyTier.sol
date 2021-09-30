// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import "./ReadOnlyTier.sol";
import { State, Status, Verify } from "../verify/Verify.sol";
import "../libraries/TierUtil.sol";

/// @title VerifyTier
///
/// @dev A contract that is `VerifyTier` expects to derive tiers from the time
/// the account was approved by the underlying `Verify` contract. The approval
/// block numbers defer to `State.since` returned from `Verify.state`.
contract VerifyTier is ReadOnlyTier {
    Verify public immutable verify;

    /// Sets the `verify` contract immutably.
    constructor(Verify verify_) public {
        verify = verify_;
    }

    ///
    /// @inheritdoc ITier
    function report(address account_) public override view returns (uint256) {
        State memory state_ = verify.state(account_);
        if (state_.status == Status.Approved) {
            return TierUtil.updateBlocksForTierRange(
                0,
                Tier.ZERO,
                Tier.EIGHT,
                state_.since
            );
        }
        else {
            return uint256(-1);
        }
    }
}