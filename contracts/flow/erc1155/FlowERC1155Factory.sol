// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../../factory/Factory.sol";
import {FlowERC1155, FlowERC1155Config} from "./FlowERC1155.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title EmissionsERC1155Factory
/// @notice Factory for deploying and registering `FlowERC1155` contracts.
contract FlowERC1155Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new FlowERC1155());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        FlowERC1155Config memory config_ = abi.decode(
            data_,
            (FlowERC1155Config)
        );
        address clone_ = Clones.clone(implementation);
        FlowERC1155(payable(clone_)).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `FlowERC1155Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `FlowERC1155` constructor configuration.
    /// @return New `FlowERC1155` child contract address.
    function createChildTyped(
        FlowERC1155Config memory config_
    ) external returns (FlowERC1155) {
        return FlowERC1155(payable(createChild(abi.encode(config_))));
    }
}
