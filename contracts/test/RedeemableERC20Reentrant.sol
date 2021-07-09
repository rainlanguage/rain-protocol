// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ReserveToken } from "./ReserveToken.sol";
import { RedeemableERC20 } from "../RedeemableERC20.sol";

contract RedeemableERC20Reentrant is ReserveToken {
    RedeemableERC20 private redeemableERC20Contract;

    constructor(RedeemableERC20 redeemableERC20Contract_) public ReserveToken() {
        redeemableERC20Contract = redeemableERC20Contract_;
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (sender_ != address(0) && sender_ == address(redeemableERC20Contract)) {
            redeemableERC20Contract.senderRedeem(amount_); // reentrant call
        }
    }
}
