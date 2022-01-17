// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

enum SaleStatus {
    Pending,
    Success,
    Fail
}

interface ISale {
    function saleStatus() external view returns (SaleStatus);
}