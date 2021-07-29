// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { RedeemableERC20Pool, RedeemableERC20PoolConfig } from "./RedeemableERC20Pool.sol";

contract RedeemableERC20PoolFactory is Factory {
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (RedeemableERC20PoolConfig memory config_) = abi.decode(data_, (RedeemableERC20PoolConfig));
        return address(new RedeemableERC20Pool(config_));
    }

    function createChild(RedeemableERC20PoolConfig calldata config_) external returns(address) {
        return this.createChild(abi.encode(config_));
    }
}