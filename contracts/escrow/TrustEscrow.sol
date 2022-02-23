// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "./SaleEscrow.sol";
import "../trust/Trust.sol";

/// @title SaleEscrow
/// An escrow that is designed to work with untrusted `Trust` bytecode.
/// `escrowStatus` wraps `Trust` functions to guarantee that results do not
/// change. Reserve and token addresses never change for a given `Trust` and
/// a pass/fail result is one-way. Even if some bug in the `Trust` causes the
/// pass/fail status to flip, this will not result in the escrow double
/// spending or otherwise changing the direction that it sends funds.
contract TrustEscrow is SaleEscrow {
    /// Trust address => CRP address.
    mapping(address => address) private crps;

    /// Immutable wrapper around `Trust.crp`.
    /// Once a `Trust` reports a crp address the `SaleEscrow` never asks
    /// again. Prevents a malicious `Trust` from changing the pool at some
    /// point to attack traders.
    /// @param trust_ The trust to fetch reserve for.
    function crp(address trust_) internal returns (address) {
        address reserve_ = crps[trust_];
        if (reserve_ == address(0)) {
            address trustReserve_ = address(Trust(trust_).crp());
            require(trustReserve_ != address(0), "0_CRP");
            crps[trust_] = trustReserve_;
            reserve_ = trustReserve_;
        }
        return reserve_;
    }
}
