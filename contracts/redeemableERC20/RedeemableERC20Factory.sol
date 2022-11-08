// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Factory} from "../factory/Factory.sol";
import {RedeemableERC20, RedeemableERC20Config} from "./RedeemableERC20.sol";
import {ITierV2} from "../tier/ITierV2.sol";
import {ClonesUpgradeable as Clones} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/// @title RedeemableERC20Factory
/// @notice Factory for deploying and registering `RedeemableERC20` contracts.
contract RedeemableERC20Factory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address public immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor() {
        address implementation_ = address(new RedeemableERC20());
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes memory data_
    ) internal virtual override returns (address) {
        RedeemableERC20Config memory config_ = abi.decode(
            data_,
            (RedeemableERC20Config)
        );
        address clone_ = Clones.clone(implementation);
        RedeemableERC20(clone_).initialize(config_);
        return clone_;
    }

    /// Allows calling `createChild` with `RedeemableERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `RedeemableERC20` initializer configuration.
    /// @return New `RedeemableERC20` child contract.
    function createChildTyped(
        RedeemableERC20Config memory config_
    ) external returns (RedeemableERC20) {
        return RedeemableERC20(createChild(abi.encode(config_)));
    }
}
