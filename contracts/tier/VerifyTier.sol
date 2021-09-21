// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import "./ReadOnlyTier.sol";
import { State, Status, Verify } from "../verify/Verify.sol";
import "./libraries/TierReport.sol";

contract VerifyTier is ReadOnlyTier {
    Verify public immutable verify;
    constructor(Verify verify_) public {
        verify = verify_;
    }
    function report(address account_) public override view returns (uint256) {
        State memory state_ = verify.state(account_);
        if (state_.status == Status.Approved) {
            return TierReport.updateBlocksForTierRange(
                0,
                Tier.ONE,
                Tier.EIGHT,
                state_.since
            );
        }
        else {
            return uint256(-1);
        }
    }
}