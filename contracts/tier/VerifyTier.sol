// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "./ReadOnlyTier.sol";
import "../verify/Verify.sol";
import "../libraries/TierUtil.sol";

contract VerifyCTier is ReadOnlyTier {
    Verify public immutable verify;
    constructor(Verify verify_) public {
        verify = verify_;
    }
    function report(address account_) public override view returns (uint256) {
        return TierUtil.updateBlocksForTierRange(
            0,
            Tier.ONE,
            Tier.EIGHT,
            uint32(verify.accountApprovedSince(account_))
        );
    }
}