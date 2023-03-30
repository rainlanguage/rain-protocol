// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "rain.interface.orderbook/ierc3156/IERC3156FlashBorrower.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "hardhat/console.sol";

import {OrderBookFlashLender} from "../../orderbook/OrderBookFlashLender.sol";
import "rain.interface.orderbook/ierc3156/IERC3156FlashLender.sol";

/// @title ERC3156FlashBorrowerTest
contract ERC3156FlashBorrowerTestReentrancy is IERC3156FlashBorrower {
    function onFlashLoan(
        address,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata
    ) external returns (bytes32) {
        if (IERC20(token).balanceOf(address(msg.sender)) > 0) {
            // siphon all the token from lender by making reentrant calls.
            IERC3156FlashLender(msg.sender).flashLoan(
                IERC3156FlashBorrower(address(this)),
                token,
                amount,
                ""
            );
            return bytes32(0);
        } else {
            // Approve debt finalization for only `amount` tokens.
            // Insufficent allowance given for `amount` which is less than `debt`
            IERC20(token).approve(msg.sender, amount + fee);
            return keccak256("ERC3156FlashBorrower.onFlashLoan");
        }
    }
}
