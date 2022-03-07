// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Factory} from "../factory/Factory.sol";
import {EmissionsERC20, EmissionsERC20Config} from "./EmissionsERC20.sol";
import {ITier} from "../tier/ITier.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title EmissionsERC20Factory
/// @notice Factory for deploying and registering `EmissionsERC20` contracts.
contract EmissionsERC20Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new EmissionsERC20());
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
        EmissionsERC20Config memory config_ = abi.decode(
            data_,
            (EmissionsERC20Config)
        );
        address clone_ = Clones.clone(implementation);
        EmissionsERC20(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `EmissionsERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `EmissionsERC20` constructor configuration.
    /// @return New `EmissionsERC20` child contract address.
    function createChildTyped(EmissionsERC20Config calldata config_)
        external
        returns (EmissionsERC20)
    {
        return EmissionsERC20(this.createChild(abi.encode(config_)));
    }
}
