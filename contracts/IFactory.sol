// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

interface IFactory {
    /// Whenever a new child contract is deployed, a `NewContract`
    /// event containing the new child contract address is emitted.
    event NewContract(address indexed _contract);

    /// Creates a new child contract.
    ///
    /// @param data_ Arbitrary data to pass into child contract constructor.
    /// @return New child contract address.
    function createChild(bytes calldata data_) external returns(address);

    /// Checks if address is registered as a child contract of this factory.
    ///
    /// @param maybeChild_ Address to be checked if registered.
    /// @return Returns true if address was deployed by this contract factory,
    /// otherwise returns false.
    function isChild(address maybeChild_) external returns(bool);
}