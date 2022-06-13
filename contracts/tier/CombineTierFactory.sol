// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {Factory} from "../factory/Factory.sol";
import {CombineTier, CombineTierConfig} from "./CombineTier.sol";

/// @title CombineTierFactory
/// @notice Factory for creating and deploying `CombineTier` contracts.
contract CombineTierFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(address vmStateBuilder_) {
        address implementation_ = address(new CombineTier(vmStateBuilder_));
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
        CombineTierConfig memory config_ = abi.decode(
            data_,
            (CombineTierConfig)
        );
        address clone_ = Clones.clone(implementation);
        CombineTier(clone_).initialize(config_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with Source.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @return New `CombineTier` child contract address.
    function createChildTyped(CombineTierConfig calldata config_)
        external
        returns (CombineTier)
    {
        return CombineTier(this.createChild(abi.encode(config_)));
    }
}
