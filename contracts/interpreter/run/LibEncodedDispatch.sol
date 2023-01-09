// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IInterpreterV1.sol";

/// @title LibEncodedDispatch
/// @notice Establishes and implements a convention for encoding an interpreter
/// dispatch. Handles encoding of several things required for efficient dispatch.
library LibEncodedDispatch {
    /// Builds an `EncodedDispatch` from its constituent parts.
    /// @param expression_ The onchain address of the expression to run.
    /// @param sourceIndex_ The index of the source to run within the expression
    /// as an entrypoint.
    /// @param maxOutputs_ The maximum outputs the caller can meaningfully use.
    /// If the interpreter returns a larger stack than this it is merely wasting
    /// gas across the external call boundary.
    /// @return The encoded dispatch.
    function encode(
        address expression_,
        SourceIndex sourceIndex_,
        uint256 maxOutputs_
    ) internal pure returns (EncodedDispatch) {
        return
            EncodedDispatch.wrap(
                (uint256(uint160(expression_)) << 32) |
                    (SourceIndex.unwrap(sourceIndex_) << 16) |
                    maxOutputs_
            );
    }

    /// Decodes an `EncodedDispatch` to its constituent parts.
    /// @param dispatch_ The `EncodedDispatch` to decode.
    /// @return The expression, source index, and max outputs as per `encode`.
    function decode(
        EncodedDispatch dispatch_
    ) internal pure returns (address, SourceIndex, uint256) {
        return (
            address(uint160(EncodedDispatch.unwrap(dispatch_) >> 32)),
            SourceIndex.wrap((EncodedDispatch.unwrap(dispatch_) >> 16) & 0xFF),
            EncodedDispatch.unwrap(dispatch_) & 0xFF
        );
    }
}
