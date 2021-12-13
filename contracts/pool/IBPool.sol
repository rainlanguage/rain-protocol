// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

interface IBPool {
    function getBalance(address token) external view returns (uint256);

    function gulp(address token) external;
}