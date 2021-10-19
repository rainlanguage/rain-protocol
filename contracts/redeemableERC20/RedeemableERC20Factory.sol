// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "../factory/Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { ITier } from "../tier/ITier.sol";

/// @title RedeemableERC20Factory
/// @notice Factory for deploying and registering `RedeemableERC20` contracts.
contract RedeemableERC20Factory is Factory {

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (RedeemableERC20Config memory config_) = abi.decode(
            data_,
            (RedeemableERC20Config)
        );
        RedeemableERC20 redeemableERC20_ = new RedeemableERC20(config_);
        return address(redeemableERC20_);
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