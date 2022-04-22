// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ReserveToken} from "./ReserveToken.sol";
import {Sale, BuyConfig} from "../sale/Sale.sol";

/// @title SaleReentrant
/// Test contract that attempts to call reentrant code on `Sale`.
/// The calls MUST fail when driven by the test harness.
contract SaleReentrant is ReserveToken {
    Sale private sale;
    BuyConfig private buyConfig;

    /// Configures the contract to attempt to reenter.
    constructor() ReserveToken() {} // solhint-disable-line no-empty-blocks

    /// Set the contract to attempt to reenter.
    /// @param sale_ Sale contract to reeenter.
    /// @param config_ BuyConfig for reentrant buy call.
    function addReentrantTarget(Sale sale_, BuyConfig calldata config_)
        external
    {
        sale = sale_;
        buyConfig = config_;
    }

    /// @inheritdoc ReserveToken
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (receiver_ != address(0) && receiver_ == address(sale)) {
            // This call MUST fail.
            sale.buy(buyConfig);
        }
    }
}