// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ERC20Push {

    using SafeERC20 for IERC20;

    function pushERC20(
        address recipient_,
        IERC20 token_,
        uint256 amount_
    ) external {
        IERC20(token_).safeTransfer(
            recipient_,
            amount_
        );
        IERC20(token_).approve(
            recipient_,
            IERC20(token_).allowance(address(this), recipient_) - amount_
        );
    }
}