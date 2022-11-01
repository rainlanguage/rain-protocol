// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../../sale/ISaleV2.sol";

contract MockISaleV2 is ISaleV2 {
    /// @inheritdoc ISaleV2
    address public reserve;
    /// @inheritdoc ISaleV2
    SaleStatus public saleStatus;
    /// @inheritdoc ISaleV2
    address public token;
    /// @inheritdoc ISaleV2
    uint256 public remainingTokenInventory;
    /// @inheritdoc ISaleV2
    uint256 public totalReserveReceived;

    function setReserve(address reserve_) external {
        reserve = reserve_;
    }

    function setSaleStatus(SaleStatus saleStatus_) external {
        saleStatus = saleStatus_;
    }

    function setToken(address token_) external {
        token = token_;
    }
}
