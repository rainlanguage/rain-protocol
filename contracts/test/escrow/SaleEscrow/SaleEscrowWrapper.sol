// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {SaleEscrow, EscrowStatus} from "../../../escrow/SaleEscrow.sol";

/// @title SaleEscrowWrapper
/// Thin wrapper around the `SaleEscrow` contract with
/// accessors to facilitate hardhat unit testing of `internal` functions
/// and variables.
contract SaleEscrowWrapper is SaleEscrow {
    function getReserve(address sale_) external view returns (address) {
        return reserves[sale_];
    }

    function getToken(address sale_) external view returns (address) {
        return tokens[sale_];
    }

    function getEscrowStatus(
        address sale_
    ) external view returns (EscrowStatus) {
        return escrowStatuses[sale_];
    }

    function fetchReserve(address sale_) external {
        reserve(sale_);
    }

    function fetchToken(address sale_) external {
        token(sale_);
    }

    function fetchEscrowStatus(address sale_) external {
        escrowStatus(sale_);
    }
}
