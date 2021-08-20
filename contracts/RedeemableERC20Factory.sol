// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

/// @title RedeemableERC20Factory
/// Factory for creating and registering new RedeemableERC20 contracts.
contract RedeemableERC20Factory is Factory {

    /// Decodes the arbitrary data_ parameter for RedeemableERC20 constructor,
    /// which expects a RedeemableERC20Config type.
    ///
    /// @param data_ Encoded data to pass down to child RedeemableERC20
    /// contract constructor.
    /// @return New RedeemableERC20 child contract address.
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

    /// Allows calling `createChild` with RedeemableERC20Config struct.
    /// Can use original Factory `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ RedeemableERC20 constructor configuration.
    /// @return New RedeemableERC20 child contract address.
    function createChild(RedeemableERC20Config calldata config_)
        external
        returns(address)
    {
        return this.createChild(abi.encode(config_));
    }
}