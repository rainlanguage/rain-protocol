// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ERC20Pull {

    using SafeERC20 for IERC20;

    address public immutable sender;

    constructor(address sender_) {
        sender = sender_;
    }

    function pullERC20(
        IERC20 token_,
        uint256 amount_
    ) external {
        IERC20(token_).safeTransferFrom(
            sender,
            address(this),
            amount_
        );
    }
}