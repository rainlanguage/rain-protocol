// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

interface IOrderBookV1 {
    /// depositor => token => vault id => token amount.
    function vaultBalance(
        address owner,
        address token,
        uint id
    ) external view returns (uint balance);
}
