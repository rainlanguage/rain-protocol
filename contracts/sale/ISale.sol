// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

enum SaleStatus {
    Pending,
    Active,
    Success,
    Fail
}

interface ISale {
    function token() external view returns (address);
    function reserve() external view returns (address);
    function saleStatus() external view returns (SaleStatus);
}