// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "rain.interface.orderbook/ierc3156/IERC3156FlashBorrower.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../math/LibFixedPointMath.sol";
import {OrderBook, DepositConfig} from "../../orderbook/OrderBook.sol";

/// @title ERC3156FlashBorrowerDepositTest
contract ERC3156FlashBorrowerDepositTest is IERC3156FlashBorrower {
    using LibFixedPointMath for uint256;
    using SafeERC20 for IERC20;

    function onFlashLoan(
        address,
        address token_,
        uint256 amount_,
        uint256,
        bytes calldata data_
    ) external returns (bytes32) {
        DepositConfig memory depositConfig = abi.decode(data_, (DepositConfig));

        // approve orderbook transfer
        IERC20(token_).approve(msg.sender, amount_);

        // deposit the flash loan
        OrderBook(msg.sender).deposit(depositConfig);

        // 'Approve' debt finalization.
        IERC20(token_).approve(msg.sender, amount_);

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
