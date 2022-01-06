// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;
import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import "./ERC20TransferTier.sol";

/// @title ERC20TransferTierFactory
/// @notice Factory for creating and deploying `ERC20TransferTier` contracts.
contract ERC20TransferTierFactory is Factory {
    address private implementation;

    constructor() {
        implementation = address(new ERC20TransferTier());
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
    function createChild(ERC20TransferTierConfig memory config_)
        external
        returns (address)
    {
        return this.createChild(abi.encode(config_));
    }
}
