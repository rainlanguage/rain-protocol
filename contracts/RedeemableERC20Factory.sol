// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

contract RedeemableERC20Factory is Factory {
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

    function createChild(RedeemableERC20Config calldata config_)
        external
        returns(address)
    {
        return this.createChild(abi.encode(config_));
    }
}