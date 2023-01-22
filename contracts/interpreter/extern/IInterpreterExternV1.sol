// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type EncodedExternDispatch is uint256;
type ExternDispatch is uint256;

interface IInterpreterExternV1 {
    function extern(
        ExternDispatch dispatch_,
        uint256[] calldata inputs_
    ) external view returns (uint256[] calldata outputs);
}
