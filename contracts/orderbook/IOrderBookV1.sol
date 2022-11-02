// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

interface IOrderBookV1 {
    /// depositor => token => vault id => token amount.
    function vaultBalance(address owner, address token, uint id)
        external
        view
        returns (uint balance);

    /// funds were cleared from the hashed order to anyone.
    function clearedOrder(uint orderHash) external view returns (uint cleared);

    /// funds were cleared from the owner of the hashed order.
    /// order owner is the counterparty funds were cleared to.
    /// order hash => order owner => token amount
    function clearedCounterparty(uint orderHash, address counterparty)
        external
        view
        returns (uint cleared);
}
