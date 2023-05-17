// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {RedeemableERC20ClaimEscrow} from "../../../escrow/RedeemableERC20ClaimEscrow.sol";

/// @title RedeemableERC20ClaimEscrowWrapper
/// Thin wrapper around the `RedeemableERC20ClaimEscrow` contract with
/// accessors to facilitate hardhat unit testing of `internal` variables.
contract RedeemableERC20ClaimEscrowWrapper is RedeemableERC20ClaimEscrow {
    function getWithdrawals(
        address trust_,
        address token_,
        uint256 supply_,
        address withdrawer_
    ) external view returns (uint256) {
        return withdrawals[trust_][token_][supply_][withdrawer_];
    }

    function getPendingDeposits(
        address trust_,
        address token_,
        address depositor_
    ) external view returns (uint256) {
        return pendingDeposits[trust_][token_][depositor_];
    }

    function getDeposits(
        address trust_,
        address token_,
        address depositor_,
        uint256 supply_
    ) external view returns (uint256) {
        return deposits[trust_][token_][depositor_][supply_];
    }

    function getTotalDeposits(
        address trust_,
        address token_,
        uint256 supply_
    ) external view returns (uint256) {
        return totalDeposits[trust_][token_][supply_];
    }
}
