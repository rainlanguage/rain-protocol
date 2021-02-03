// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract Redeemer {

    uint256 public unlockTime;
    uint256 public ratio;
    IERC20 reserveToken;
    IERC20 token;

    constructor(
        IERC20 _reserveToken,
        uint256 _reserveTokenAmount,
        IERC20 _token,
        uint256 _unlockTime
    ) public {
        require(_unlockTime > block.timestamp, "ERR_INIT_PAST");
        unlockTime = _unlockTime;
        reserveToken = _reserveToken;
        token = _token;

        bool xfer = IERC20(reserveToken).transferFrom(msg.sender, address(this), _reserveTokenAmount);
        require(xfer, "ERR_INIT_RESERVE");

        ratio = SafeMath.div(
            _reserveTokenAmount,
            IERC20(token).totalSupply(),
            "ERR_INIT_RATIO"
        );
    }

    function isUnlocked() public view returns(bool _isUnlocked) {
        return unlockTime < block.timestamp;
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
