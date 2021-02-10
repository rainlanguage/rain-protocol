// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract Redeemer is Ownable {

    uint256 public unlockBlock;
    uint256 public ratio;
    IERC20 reserveToken;
    IERC20 token;

    bool initialized = false;
    modifier onlyNotInit {
        require(!initialized);
        _;
    }

    function init(
        IERC20 _reserve_token,
        uint256 _reserve_token_amount,
        IERC20 _token,
        uint256 _unlock_block
    ) public onlyOwner onlyNotInit {
        console.log("Redeemer init");

        require(_unlock_block > block.number, "ERR_INIT_PAST");
        unlockBlock = _unlock_block;
        reserveToken = _reserve_token;
        token = _token;

        console.log("Redeemer init: About to transfer %s reserve from %s%", _reserve_token_amount, address(msg.sender));
        bool xfer = IERC20(reserveToken).transferFrom(address(msg.sender), address(this), _reserve_token_amount);
        require(xfer, "ERR_INIT_RESERVE");

        ratio = SafeMath.div(
            _reserve_token_amount,
            IERC20(token).totalSupply(),
            "ERR_INIT_RATIO"
        );
    }

    function isUnlocked() public view returns(bool _isUnlocked) {
        return unlockBlock < block.number;
    }

    modifier onlyIfUnlocked {
        require(isUnlocked());
        _;
    }

    function redeem(uint256 redeemAmount) public onlyIfUnlocked {
        bool xferIn = IERC20(token).transferFrom(msg.sender, address(this), redeemAmount);
        require(xferIn, "ERR_REDEEM_TOKEN");

        bool xferOut = IERC20(reserveToken).transferFrom(address(this), msg.sender, SafeMath.mul(ratio, redeemAmount));
        require(xferOut, "ERR_REDEEM_RESERVE");
    }
}
