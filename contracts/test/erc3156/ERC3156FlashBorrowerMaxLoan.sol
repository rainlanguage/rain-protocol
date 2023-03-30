// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "rain.interface.orderbook/ierc3156/IERC3156FlashBorrower.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {OrderBookFlashLender} from "../../orderbook/OrderBookFlashLender.sol";
import "rain.interface.orderbook/ierc3156/IERC3156FlashLender.sol";

/// @title ERC3156FlashBorrowerTest
contract ERC3156FlashBorrowerMaxLoan is IERC3156FlashBorrower {
    function onFlashLoan(
        address,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata
    ) external returns (bytes32) {
        /// If there is an active debt
        /// then loans are disabled so the max becomes `0`
        require(
            IERC3156FlashLender(msg.sender).maxFlashLoan(token) == 0,
            "Non-Zero Max Flash Loan"
        );
        IERC20(token).approve(msg.sender, amount + fee);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
