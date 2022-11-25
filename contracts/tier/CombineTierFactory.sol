// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import {Factory} from "../factory/Factory.sol";
import {CombineTier, CombineTierConfig} from "./CombineTier.sol";

/// @title CombineTierFactory
/// @notice Factory for creating and deploying `CombineTier` contracts.
contract CombineTierFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new CombineTier());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
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
    function createChildTyped(
        CombineTierConfig memory config_
    ) external returns (CombineTier) {
        return CombineTier(createChild(abi.encode(config_)));
    }
}
