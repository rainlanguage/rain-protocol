// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { IFactory } from "./IFactory.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Factory
/// Base contract for creating and registering deployed
/// child contracts.
abstract contract Factory is IFactory, ReentrancyGuard {
    mapping(address => bool) private contracts;

    /// Implements `IFactory`.
    ///
    /// `_createChild` hook must be overridden to actually create child
    /// contract.
    ///
    /// @param data_ Encoded data to pass down to child contract constructor.
    function _createChild(bytes calldata data_)
        internal
        virtual
        returns(address)
    { } // solhint-disable-line no-empty-blocks

    /// Implements `IFactory`.
    ///
    /// Calls the _createChild hook, which inheriting contracts must override.
    /// Registers child contract address to `contracts` mapping.
    /// Emits `NewContract` event.
    ///
    /// @param data_ Encoded data to pass down to child contract constructor.
    /// @return New child contract address.
    function createChild(bytes calldata data_)
        external
        virtual
        override
        nonReentrant
        returns(address) {
        // Create child contract using hook.
        address child_ = _createChild(data_);
        // Register child contract address to `contracts` mapping.
        contracts[child_] = true;
        // Emit `NewContract` event with child contract address.
        emit IFactory.NewContract(child_);
        return child_;
    }

    /// Implements `IFactory`.
    ///
    /// Checks if address is registered as a child contract of this factory.
    ///
    /// @param maybeChild_ Address of child contract to look up.
    /// @return Returns true if address is a contract created by this
    /// contract factory, otherwise returns false.
    function isChild(address maybeChild_)
        external
        virtual
        override
        returns(bool)
    {
        return contracts[maybeChild_];
    }
}