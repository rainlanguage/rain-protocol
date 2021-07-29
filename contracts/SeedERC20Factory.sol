// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { SeedERC20, SeedERC20Config } from "./SeedERC20.sol";

contract SeedERC20Factory is Factory {
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (SeedERC20Config memory config_) = abi.decode(data_, (SeedERC20Config));
        return address(new SeedERC20(config_));
    }

    function createChild(SeedERC20Config calldata config_) external returns(address) {
        return this.createChild(abi.encode(config_));
    }
}