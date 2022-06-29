// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Factory} from "../../factory/Factory.sol";
import "./AutoApprove.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title AutoApproveFactory
/// @notice Factory for creating and deploying `AutoApprove` contracts.
contract AutoApproveFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(address vmStateBuilder_) {
        address implementation_ = address(new AutoApprove(vmStateBuilder_));
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
        StateConfig memory config_ = abi.decode(data_, (StateConfig));
        address clone_ = Clones.clone(implementation);
        AutoApprove(clone_).initialize(config_);
        // Caller MUST transfer ownership to the `Verify` contract that is
        // attempting to call the autoapprover callbacks, otherwise every
        // callback will revert.
        AutoApprove(clone_).transferOwnership(msg.sender);
        return clone_;
    }

    /// Allows calling `createChild` with typed arguments.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ initialize configuration.
    /// @return New `AutoApprove` child contract.
    function createChildTyped(StateConfig calldata config_)
        external
        returns (AutoApprove)
    {
        return AutoApprove(this.createChild(abi.encode(config_)));
    }
}
