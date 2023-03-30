// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "rain.interface.orderbook/ierc3156/IERC3156FlashBorrower.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../math/LibFixedPointMath.sol";
import {OrderBook, TakeOrderConfig, TakeOrdersConfig} from "../../orderbook/OrderBook.sol";

/// @title ERC3156FlashBorrowerBuyTest
contract ERC3156FlashBorrowerBuyTest is IERC3156FlashBorrower {
    using LibFixedPointMath for uint256;
    using SafeERC20 for IERC20;

    function onFlashLoan(
        address,
        address tokenA_,
        uint256 amount_,
        uint256,
        bytes calldata data_
    ) external returns (bytes32) {
        TakeOrdersConfig memory takeOrdersConfig = abi.decode(
            data_,
            (TakeOrdersConfig)
        );

        // simulate 'buy' from external market using loaned tokenA_

        // 'gives' tokenA_ to market
        IERC20(tokenA_).safeTransfer(address(1), amount_);

        // 'receives' tokenB from market.
        // make sure this contract has at least a balance of `receiveAmountB`
        // before triggering `onFlashLoan` callback.
        uint256 receiveAmountB = amount_.fixedPointMul(
            1020000000000000000,
            Math.Rounding.Down
        );
        require(
            IERC20(takeOrdersConfig.output).balanceOf(address(this)) ==
                receiveAmountB,
            "PRE_BUY"
        );

        // approve orderbook transfer
        IERC20(takeOrdersConfig.output).approve(msg.sender, receiveAmountB);

        // take orderbook order
        OrderBook(msg.sender).takeOrders(takeOrdersConfig);

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
