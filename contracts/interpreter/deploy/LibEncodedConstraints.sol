// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IExpressionDeployerV1.sol";

library LibEncodedConstraints {
    function encode(uint minFinalStackHeight_, uint mutable_) pure internal returns (EncodedConstraints) {
        return EncodedConstraints.wrap(
            minFinalStackHeight_ << 1 | mutable_ & 1
        );
    }

    function decode(EncodedConstraints constraints_) pure internal returns (uint minFinalStackHeight_, uint mutable_) {
        return (EncodedConstraints.unwrap(constraints_) >> 1, EncodedConstraints.unwrap(constraints_) & 1);
    }

    function arrayFrom(EncodedConstraints a_, EncodedConstraints b_) pure internal returns (EncodedConstraints[] memory) {
        EncodedConstraints[] memory constraints_ = new EncodedConstraints[](2);
        constraints_[0] = a_;
        constraints_[1] = b_;
        return constraints_;    }
}