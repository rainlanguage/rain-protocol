// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {Factory} from "../factory/Factory.sol";
import {FlowERC20, FlowERC20Config} from "./FlowERC20.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title EmissionsERC20Factory
/// @notice Factory for deploying and registering `FlowERC20` contracts.
contract FlowERC20Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(address vmIntegrity_) {
        address implementation_ = address(new FlowERC20(vmIntegrity_));
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(bytes memory data_)
        internal
        virtual
        override
        returns (address)
    {
        FlowERC20Config memory config_ = abi.decode(data_, (FlowERC20Config));
        address clone_ = Clones.clone(implementation);
        FlowERC20(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `FlowERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `FlowERC20` constructor configuration.
    /// @return New `FlowERC20` child contract address.
    function createChildTyped(FlowERC20Config memory config_)
        external
        returns (FlowERC20)
    {
        return FlowERC20(createChild(abi.encode(config_)));
    }
}
