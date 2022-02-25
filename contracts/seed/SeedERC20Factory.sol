// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Factory} from "../factory/Factory.sol";
import {SeedERC20, SeedERC20Config} from "./SeedERC20.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title SeedERC20Factory
/// @notice Factory for creating and deploying `SeedERC20` contracts.
contract SeedERC20Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new SeedERC20());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata data_)
        internal
        virtual
        override
        returns (address)
    {
        SeedERC20Config memory config_ = abi.decode(data_, (SeedERC20Config));
        address clone_ = Clones.clone(implementation);
        SeedERC20(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `SeedERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `SeedERC20` constructor configuration.
    /// @return New `SeedERC20` child contract.
    function createChildTyped(SeedERC20Config calldata config_)
        external
        returns (SeedERC20)
    {
        return SeedERC20(this.createChild(abi.encode(config_)));
    }
}
