// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Factory} from "../factory/Factory.sol";
import {RedeemableERC20Unfreezable, RedeemableERC20Config} from "./RedeemableERC20Unfreezable.sol";
import {ITier} from "../tier/ITier.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title RedeemableERC20UnfreezableFactory
/// @notice Factory for deploying and registering `RedeemableERC20Unfreezable` contracts.
contract RedeemableERC20UnfreezableFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new RedeemableERC20Unfreezable());
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
        RedeemableERC20Config memory config_ = abi.decode(
            data_,
            (RedeemableERC20Config)
        );
        address clone_ = Clones.clone(implementation);
        RedeemableERC20Unfreezable(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `RedeemableERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `RedeemableERC20Unfreezable` constructor configuration.
    /// @return New `RedeemableERC20Unfreezable` child contract.
    function createChildTyped(RedeemableERC20Config calldata config_)
        external
        returns (RedeemableERC20Unfreezable)
    {
        return RedeemableERC20Unfreezable(this.createChild(abi.encode(config_)));
    }
}
