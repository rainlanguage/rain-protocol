// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../../../factory/Factory.sol";
import "./FactoryChildTest.sol";

import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title FactoryTest
/// @notice Test factory for creating and deploying `FactoryChildTest` contracts.
contract FactoryTest is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new FactoryChildTest());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        uint256 value_ = abi.decode(data_, (uint256));
        address clone_ = Clones.clone(implementation);
        FactoryChildTest(clone_).initialize(value_);
        return clone_;
    }

    /// Allows calling `createChild` with `uint256` type.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param value_ `uint256` some value to be sent down to child.
    /// @return New `FactoryChildTest` child contract.
    function createChildTyped(
        uint256 value_
    ) external returns (FactoryChildTest) {
        return FactoryChildTest(createChild(abi.encodePacked(value_)));
    }
}
