// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../IVerifyV1.sol";

library LibVerifyStatus {
    function eq(VerifyStatus a_, VerifyStatus b_) internal pure returns (bool) {
        return VerifyStatus.unwrap(a_) == VerifyStatus.unwrap(b_);
    }
}
