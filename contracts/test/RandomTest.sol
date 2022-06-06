// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../math/Random.sol";

import "hardhat/console.sol";

contract RandomTest {
    uint public item;

    function microLottery(uint seed_, uint max_, uint n_) public {
        uint item_;
        uint a_ = gasleft();
        item_ = Random.microLottery(seed_, max_, n_);
        uint b_ = gasleft();
        console.log("microLottery gas used: %s", a_ - b_);
        item = item_;
    }
}