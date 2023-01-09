// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/run/LibEncodedDispatch.sol";

/// @title LibEncodedDispatchTest
/// Thin wrapper around `LibEncodedDispatchTest` library exposing methods for testing
contract LibEncodedDispatchTest {
    function encode(
        address expressionPointer_,
        uint256 sourceIndex_,
        uint256 maxOutputs_
    ) external pure returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expressionPointer_,
                SourceIndex.wrap(sourceIndex_),
                maxOutputs_
            );
    }

    function decode(
        EncodedDispatch dispatch_
    ) external pure returns (address, SourceIndex, uint256) {
        return LibEncodedDispatch.decode(dispatch_);
    }
}
