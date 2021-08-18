// SPDX-License-Identifier: MIT
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
    /// `_createChild` hook can be overridden to allow inheriting
    /// factory contracts to enforce number of function call
    /// parameters and parameter types.
    function _createChild(bytes calldata data_)
        internal
        virtual
        returns(address)
    { } // solhint-disable-line no-empty-blocks

    /// Implements `IFactory`.
    ///
    /// Calls the _createChild hook, which inheriting contracts
    /// should override to enforce extra requirements.
    /// Registers child contract address to `contracts` mapping.
    /// Emits `NewContract` event.
    function createChild(bytes calldata data_)
        external
        virtual
        override
        nonReentrant
        returns(address) {
        // Create child contract.
        address child_ = _createChild(data_);
        // Register child contract address to `contracts` mapping.
        contracts[child_] = true;
        // Emit `NewContract` event with child contract address.
        emit IFactory.NewContract(child_);
        return child_;
    }

    /// Implements `IFactory`.
    ///
    /// Returns true if address is a contract created by this
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