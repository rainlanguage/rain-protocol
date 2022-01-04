// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Factory } from "../factory/Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { ITier } from "../tier/ITier.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title RedeemableERC20Factory
/// @notice Factory for deploying and registering `RedeemableERC20` contracts.
contract RedeemableERC20Factory is Factory {

    address public immutable implementation;

    constructor() {
        implementation = address(new RedeemableERC20());
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (RedeemableERC20Config memory config_) = abi.decode(
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
    /// @param config_ `RedeemableERC20` constructor configuration.
    /// @return New `RedeemableERC20` child contract address.
    function createChild(RedeemableERC20Config calldata config_)
        external
        returns(address)
    {
        return this.createChild(abi.encode(config_));
    }
}