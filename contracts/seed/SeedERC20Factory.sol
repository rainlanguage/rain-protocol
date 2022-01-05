// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Factory } from "../factory/Factory.sol";
import { SeedERC20, SeedERC20Config } from "./SeedERC20.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title SeedERC20Factory
/// @notice Factory for creating and deploying `SeedERC20` contracts.
contract SeedERC20Factory is Factory {

    address public immutable implementation;

    constructor() {
        implementation = address(new SeedERC20());
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (SeedERC20Config memory config_) = abi.decode(
            data_,
            (SeedERC20Config)
        );
        address clone_ = Clones.clone(implementation);
        SeedERC20(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `SeedERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `SeedERC20` constructor configuration.
    /// @return New `SeedERC20` child contract address.
    function createChildTyped(SeedERC20Config calldata config_)
        external
        returns(SeedERC20)
    {
        return SeedERC20(this.createChild(abi.encode(config_)));
    }
}