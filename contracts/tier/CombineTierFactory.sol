// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {Factory} from "../factory/Factory.sol";
import {CombineTier} from "./CombineTier.sol";
import {StateConfig} from "../vm/VMMeta.sol";

/// @title CombineTierFactory
/// @notice Factory for creating and deploying `CombineTier` contracts.
contract CombineTierFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(bytes memory fnPtrs_) {
        address implementation_ = address(new CombineTier(fnPtrs_));
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata stateBytes_)
        internal
        virtual
        override
        returns (address)
    {
        address clone_ = Clones.clone(implementation);
        CombineTier(clone_).initialize(stateBytes_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with Source.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @return New `CombineTier` child contract address.
    function createChildTyped(bytes calldata stateBytes_)
        external
        returns (CombineTier)
    {
        return CombineTier(this.createChild(stateBytes_));
    }
}
