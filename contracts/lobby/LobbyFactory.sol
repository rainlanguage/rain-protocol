// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../factory/Factory.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "./Lobby.sol";

/// @title LobbyFactory
/// @notice Factory for deploying and registering `Lobby` contracts.
contract LobbyFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(uint256 maxTimeoutDuration_) {
        address implementation_ = address(new Lobby(maxTimeoutDuration_));
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        LobbyConfig memory config_ = abi.decode(data_, (LobbyConfig));
        address clone_ = Clones.clone(implementation);
        Lobby(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `LobbyConfig` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `Lobby` constructor configuration.
    /// @return New `Lobby` child contract address.
    function createChildTyped(
        LobbyConfig memory config_
    ) external returns (Lobby) {
        return Lobby(createChild(abi.encode(config_)));
    }
}
