// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;
import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import "./ERC20TransferTier.sol";

/// @title ERC20TransferTierFactory
/// @notice Factory for creating and deploying `ERC20TransferTier` contracts.
contract ERC20TransferTierFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new ERC20TransferTier());
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
        ERC20TransferTierConfig memory config_ = abi.decode(
            data_,
            (ERC20TransferTierConfig)
        );
        address clone_ = Clones.clone(implementation);
        ERC20TransferTier(clone_).initialize(config_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with `ERC20TransferTierConfig`.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ Constructor config for `ERC20TransferTier`.
    /// @return New `ERC20TransferTier` child contract address.
    function createChildTyped(ERC20TransferTierConfig memory config_)
        external
        returns (ERC20TransferTier)
    {
        return ERC20TransferTier(this.createChild(abi.encode(config_)));
    }
}
