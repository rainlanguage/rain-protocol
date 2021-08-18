// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

interface IFactory {
    /// Whenever a new child contract is deployed, a `NewContract`
    /// event containing the new child contract is address is emitted.
    event NewContract(address indexed _contract);

    /// Creates a new child contract.
    ///
    /// @param data_ Arbitrary data to pass into child contract constructor.
    function createChild(bytes calldata data_) external returns(address);

    /// Returns true if address was deployed by this contract factory,
    /// otherwise returns false.
    ///
    /// @param maybeChild_ Address to be checked if registered.
    function isChild(address maybeChild_) external returns(bool);
}