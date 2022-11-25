// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../../factory/Factory.sol";
import "./AutoApprove.sol";

import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title AutoApproveFactory
/// @notice Factory for creating and deploying `AutoApprove` contracts.
contract AutoApproveFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new AutoApprove());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// Note: Caller MUST transfer ownership to the `Verify` contract that is
    /// attempting to call the autoapprover callbacks, otherwise every
    /// callback will revert.
    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        AutoApproveConfig memory config_ = abi.decode(
            data_,
            (AutoApproveConfig)
        );
        address clone_ = Clones.clone(implementation);
        AutoApprove(clone_).initialize(config_);
        AutoApprove(clone_).transferOwnership(msg.sender);
        return clone_;
    }

    /// Allows calling `createChild` with typed arguments.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ initialize configuration.
    /// @return New `AutoApprove` child contract.
    function createChildTyped(
        AutoApproveConfig memory config_
    ) external returns (AutoApprove) {
        return AutoApprove(createChild(abi.encode(config_)));
    }
}
