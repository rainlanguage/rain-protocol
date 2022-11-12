// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IExpressionDeployerV1.sol";

type StateNamespaceSeed is uint;
type StateNamespace is uint;

library LibEncodedConstraints {
    function expressionsTrustEachOtherNamespaceSeed()
        internal
        pure
        returns (StateNamespaceSeed)
    {
        return StateNamespaceSeed.wrap(0);
    }

    function expressionsTrustTheirAuthorNamespaceSeed(
        address author_
    ) internal pure returns (StateNamespaceSeed) {
        return StateNamespaceSeed.wrap(uint(uint160(author_)));
    }

    function encode(
        StateNamespaceSeed stateNamespaceSeed_,
        uint minStackOutputs_
    ) internal pure returns (EncodedConstraints) {
        // Hash the state namespace before bit shifting it as the high bits MAY
        // be critical to prevent some collision, but we we can drop 16 bits after
        // hashing and still be collision resistant.
        return
            EncodedConstraints.wrap(
                (uint(
                    keccak256(
                        abi.encodePacked(
                            StateNamespaceSeed.unwrap(stateNamespaceSeed_)
                        )
                    )
                ) << 16) | (minStackOutputs_ & 0xFFFF)
            );
    }

    function decode(
        EncodedConstraints constraints_
    )
        internal
        pure
        returns (StateNamespace stateNamespace_, uint minStackOutputs_)
    {
        return (
            StateNamespace.wrap(EncodedConstraints.unwrap(constraints_) >> 16),
            EncodedConstraints.unwrap(constraints_) & 0xFFFF
        );
    }

    function arrayFrom(
        EncodedConstraints a_
    ) internal pure returns (EncodedConstraints[] memory) {
        EncodedConstraints[] memory array_ = new EncodedConstraints[](1);
        array_[0] = a_;

        return array_;
    }

    function arrayFrom(
        EncodedConstraints a_,
        EncodedConstraints b_
    ) internal pure returns (EncodedConstraints[] memory) {
        EncodedConstraints[] memory array_ = new EncodedConstraints[](2);
        array_[0] = a_;
        array_[1] = b_;

        return array_;
    }
}
