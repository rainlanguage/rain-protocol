// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;
import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import "./ERC721BalanceTier.sol";

/// @title ERC721BalanceTierFactory
/// @notice Factory for creating and deploying `ERC721BalanceTier` contracts.
contract ERC721BalanceTierFactory is Factory {
    address private implementation;

    constructor() {
        implementation = address(new ERC721BalanceTier());
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata data_)
        internal
        virtual
        override
        returns (address)
    {
        ERC721BalanceTierConfig memory config_ = abi.decode(
            data_,
            (ERC721BalanceTierConfig)
        );
        address clone_ = Clones.clone(implementation);
        ERC721BalanceTier(clone_).initialize(config_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with `ERC721BalanceTierConfig`.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ Constructor config for `ERC721BalanceTier`.
    /// @return New `ERC721BalanceTier` child contract address.
    function createChildTyped(ERC721BalanceTierConfig memory config_)
        external
        returns (ERC721BalanceTier)
    {
        return ERC721BalanceTier(this.createChild(abi.encode(config_)));
    }
}
