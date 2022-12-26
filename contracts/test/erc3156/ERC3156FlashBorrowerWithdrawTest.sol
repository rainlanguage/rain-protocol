// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "../../ierc3156/IERC3156FlashBorrower.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../math/FixedPointMath.sol";
import {OrderBook, WithdrawConfig, DepositConfig} from "../../orderbook/OrderBook.sol";

/// @title ERC3156FlashBorrowerWithdrawTest
contract ERC3156FlashBorrowerWithdrawTest is IERC3156FlashBorrower {
    using FixedPointMath for uint256;
    using SafeERC20 for IERC20;

    function orderBookDeposit(
        address orderbook_,
        DepositConfig calldata config_
    ) external {
        IERC20(config_.token).approve(orderbook_, config_.amount);
        OrderBook(orderbook_).deposit(config_);
    }

    function onFlashLoan(
        address,
        address token_,
        uint256 amount_,
        uint256,
        bytes calldata data_
    ) external returns (bytes32) {
        WithdrawConfig memory withdrawConfig = abi.decode(
            data_,
            (WithdrawConfig)
        );

        OrderBook(msg.sender).withdraw(withdrawConfig);

        // approve orderbook transfer
        IERC20(token_).approve(msg.sender, amount_);

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
