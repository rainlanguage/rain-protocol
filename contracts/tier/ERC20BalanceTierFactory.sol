// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;
import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import "./ERC20BalanceTier.sol";

/// @title ERC20BalanceTierFactory
/// @notice Factory for creating and deploying `ERC20BalanceTier` contracts.
contract ERC20BalanceTierFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new ERC20BalanceTier());
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
        ERC20BalanceTierConfig memory config_ = abi.decode(
            data_,
            (ERC20BalanceTierConfig)
        );
        address clone_ = Clones.clone(implementation);
        ERC20BalanceTier(clone_).initialize(config_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with `ERC20BalanceTierConfig`.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ Constructor config for `ERC20BalanceTier`.
    /// @return New `ERC20BalanceTier` child contract address.
    function createChildTyped(ERC20BalanceTierConfig calldata config_)
        external
        returns (ERC20BalanceTier)
    {
        return ERC20BalanceTier(this.createChild(abi.encode(config_)));
    }
}
