// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ReserveToken } from "./ReserveToken.sol";
import { SeedERC20 } from "../SeedERC20.sol";

contract SeedERC20Reentrant is ReserveToken {
    SeedERC20 private seedERC20Contract;
    uint8 public methodTarget = 0;

    function addReentrantTarget(SeedERC20 seedERC20Contract_) external {
        seedERC20Contract = seedERC20Contract_;
    }

    function setMethodTarget(uint8 methodTarget_) external {
        methodTarget = methodTarget_;
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (methodTarget == 1 && receiver_ == address(seedERC20Contract)) {
            seedERC20Contract.seed(0, 1); // reentrant call
        } else if (methodTarget == 2 && sender_ == address(seedERC20Contract)) {
            seedERC20Contract.unseed(1); // reentrant call
        }
    }
}
