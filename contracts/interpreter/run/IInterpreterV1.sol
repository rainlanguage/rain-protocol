// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type SourceIndex is uint;
type EncodedDispatch is uint256;

interface IInterpreterV1 {
    function functionPointers() external view returns (bytes memory);

    function eval(
        EncodedDispatch dispatch,
        uint256[][] memory context
    )
        external
        view
        returns (uint256[] memory stack, uint[] memory stateChanges);

    /// Saves kvs returned by one or more eval calls.
    /// State changes MUST be stored in a mapping under the caller to prevent a
    /// malicious caller from corrupting keys from another caller.
    /// Caller MUST consider the potential of reentrancy from a malicious
    /// interpreter when calling setKVs.
    function stateChanges(
        EncodedDispatch dispatch,
        uint[][] memory stateChanges
    ) external;
}
