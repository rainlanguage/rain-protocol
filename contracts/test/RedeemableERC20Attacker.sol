// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import {ReserveToken} from "./ReserveToken.sol";
import {RedeemableERC20} from "../RedeemableERC20.sol";

contract RedeemableERC20Attacker is ReserveToken {
    address private victim;
    RedeemableERC20 private victimInstance;

    constructor(address victim_) public ReserveToken() {
        victim = victim_;
        victimInstance = RedeemableERC20(victim_);
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (sender_ != address(0) && sender_ == victim) {
            victimInstance.senderRedeem(amount_); // reentrant call
        }
    }
}
