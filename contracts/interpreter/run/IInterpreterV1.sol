// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type SourceIndex is uint;
type EncodedDispatch is uint256;
type StateNamespace is uint;

interface IInterpreterV1 {
    function functionPointers() external view returns (bytes memory);

    function eval(
        EncodedDispatch dispatch,
        uint256[][] calldata context
    )
        external
        view
        returns (uint256[] memory stack, uint[] memory stateChanges);

    function stateChanges(uint[] calldata stateChanges) external;

    function evalWithNamespace(
        StateNamespace namespace,
        EncodedDispatch dispatch,
        uint[][] calldata context
    ) external view returns (uint[] memory stack, uint[] memory stateChanges);

    function stateChangesWithNamespace(
        StateNamespace namespace,
        uint[] calldata stateChanges
    ) external;
}
