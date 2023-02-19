// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./Factory.sol";
import "./ICloneableV1.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// Thrown when an implementation is the zero address which is always a mistake.
error ZeroImplementation();

contract CloneFactory is Factory {
    address public immutable implementation;

    constructor(address implementation_) {
        if (implementation_ == address(0)) {
            revert ZeroImplementation();
        }
        implementation = implementation_;
        emit Implementation(msg.sender, implementation_);
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        address clone_ = Clones.clone(implementation);
        ICloneableV1(clone_).initialize(data_);
        return clone_;
    }
}
