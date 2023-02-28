// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

interface ICloneableFactoryV1 {
    event NewClone(
        address sender,
        address implementation,
        address clone,
        bytes data
    );

    /// Creates a new child contract.
    ///
    /// @param data As per `ICloneableV1`.
    /// @return New child contract address.
    function clone(
        address implementation,
        bytes calldata data
    ) external returns (address);
}
