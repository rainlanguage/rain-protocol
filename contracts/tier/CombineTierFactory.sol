// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../vm/ImmutableSource.sol";
import { Factory } from "../factory/Factory.sol";
import { CombineTier } from "./CombineTier.sol";

/// @title CombineTierFactory
/// @notice Factory for creating and deploying `CombineTier` contracts.
contract CombineTierFactory is Factory {

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (ImmutableSourceConfig memory config_)
            = abi.decode(data_, (ImmutableSourceConfig));
        return address(new CombineTier(config_));
    }

    /// Typed wrapper for `createChild` with Source.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `ImmutableSourceConfig` of the `CombineTier` logic.
    /// @return New `CombineTier` child contract address.
    function createChild(ImmutableSourceConfig calldata config_)
        external
        returns(address) {
        return this.createChild(abi.encode(config_));
    }
}