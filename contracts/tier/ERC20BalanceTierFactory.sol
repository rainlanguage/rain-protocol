// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Factory } from "../factory/Factory.sol";
import "./ERC20BalanceTier.sol";

/// @title ERC20BalanceTierFactory
/// @notice Factory for creating and deploying `ERC20BalanceTier` contracts.
contract ERC20BalanceTierFactory is Factory {

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (ERC20BalanceTierConfig memory config_)
            = abi.decode(data_, (ERC20BalanceTierConfig));
        return address(new ERC20BalanceTier(config_));
    }

    /// Typed wrapper for `createChild` with `ERC20BalanceTierConfig`.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ Constructor config for `ERC20BalanceTier`.
    /// @return New `ERC20BalanceTier` child contract address.
    function createChild(ERC20BalanceTierConfig memory config_)
        external
        returns(address)
    {
        return this.createChild(abi.encode(config_));
    }
}