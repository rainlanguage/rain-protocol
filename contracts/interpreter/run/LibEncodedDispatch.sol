// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IInterpreterV1.sol";

library LibEncodedDispatch {
    function encode(
        address expressionPointer_,
        SourceIndex sourceIndex_,
        uint maxOutputs_
    ) internal pure returns (EncodedDispatch) {
        return
            EncodedDispatch.wrap(
                (expressionPointer_ << 32) | (sourceIndex_ << 16) | maxOutputs_
            );
    }

    function decode(
        EncodedDispatch dispatch_
    ) internal pure returns (address, uint, uint) {
        return (
            EncodedDispatch.unwrap(dispatch_) >> 32,
            (EncodedDispatch.unwrap(dispatch_) >> 16) & 0xFF,
            EncodedDispatch.unwrap(dispatch_) & 0xFF
        );
    }
}
