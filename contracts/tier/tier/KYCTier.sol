// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "./ReadOnlyTier.sol";
import "../../../kyc/KYC.sol";
import "../libraries/TierUtil.sol";

contract KYCTier is ReadOnlyTier {
    KYC public immutable kyc;
    constructor(KYC kyc_) public {
        kyc = kyc_;
    }
    function report(address account_) public override view returns (uint256) {
        return TierUtil.updateBlocksForTierRange(
            0,
            Tier.ONE,
            Tier.EIGHT,
            uint32(kyc.accountApprovedSince(account_))
        );
    }
}