// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./Factory.sol";
import "./ICloneableV1.sol";
import "./ICloneFactoryV1.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// Thrown when an implementation is the zero address which is always a mistake.
error ZeroImplementation();

contract CloneFactory is ICloneableFactoryV1 {
    /// @inheritdoc ICloneableFactoryV1
    function clone(
        address implementation_,
        bytes calldata data_
    ) external returns (address) {
        if (implementation_ == address(0)) {
            revert ZeroImplementation();
        }
        address clone_ = Clones.clone(implementation_);
        emit NewClone(msg.sender, implementation_, clone_, data_);
        ICloneableV1(clone_).initialize(data_);
        return clone_;
    }
}
