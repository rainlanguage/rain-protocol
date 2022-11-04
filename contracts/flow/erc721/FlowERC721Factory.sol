// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../../factory/Factory.sol";
import {FlowERC721, FlowERC721Config} from "./FlowERC721.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title EmissionsERC721Factory
/// @notice Factory for deploying and registering `FlowERC721` contracts.
contract FlowERC721Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new FlowERC721());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        FlowERC721Config memory config_ = abi.decode(data_, (FlowERC721Config));
        address clone_ = Clones.clone(implementation);
        FlowERC721(payable(clone_)).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `FlowERC721Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `FlowERC721` constructor configuration.
    /// @return New `FlowERC721` child contract address.
    function createChildTyped(
        FlowERC721Config memory config_
    ) external returns (FlowERC721) {
        return FlowERC721(payable(createChild(abi.encode(config_))));
    }
}
