// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Trust, DistributionStatus} from "../trust/Trust.sol";

/// Represents the 3 possible statuses an escrow could care about.
/// Either the escrow takes no action or consistently allows a success/fail
/// action.
enum EscrowStatus {
    /// The underlying `Trust` has not reached a definitive pass/fail state.
    /// Important this is the first item in the enum as inequality is used to
    /// check pending vs. pass/fail in security sensitive code.
    Pending,
    /// The underlying `Trust` distribution failed.
    Fail,
    /// The underlying `Trust` distribution succeeded.
    Success
}

/// @title TrustEscrow
/// An escrow that is designed to work with untrusted `Trust` bytecode.
/// `escrowStatus` wraps `Trust` functions to guarantee that results do not
/// change. Reserve and token addresses never change for a given `Trust` and
/// a pass/fail result is one-way. Even if some bug in the `Trust` causes the
/// pass/fail status to flip, this will not result in the escrow double
/// spending or otherwise changing the direction that it sends funds.
contract TrustEscrow {
    /// Trust address => CRP address.
    mapping(address => address) private crps;
    /// Trust address => reserve address.
    mapping(address => address) private reserves;
    /// Trust address => token address.
    mapping(address => address) private tokens;
    /// Trust address => status.
    mapping(address => EscrowStatus) private escrowStatuses;

    /// Immutable wrapper around `Trust.crp`.
    /// Once a `Trust` reports a crp address the `TrustEscrow` never asks
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

    /// Immutable wrapper around `Trust.reserve`.
    /// Once a `Trust` reports a reserve address the `TrustEscrow` never asks
    /// again. Prevents a malicious `Trust` from changing the reserve at some
    /// point to break internal escrow accounting.
    /// @param trust_ The trust to fetch reserve for.
    function reserve(address trust_) internal returns (address) {
        address reserve_ = reserves[trust_];
        if (reserve_ == address(0)) {
            address trustReserve_ = address(Trust(trust_).reserve());
            require(trustReserve_ != address(0), "0_RESERVE");
            reserves[trust_] = trustReserve_;
            reserve_ = trustReserve_;
        }
        return reserve_;
    }

    /// Immutable wrapper around `Trust.token`.
    /// Once a `Trust` reports a token address the `TrustEscrow` never asks
    /// again. Prevents a malicious `Trust` from changing the token at some
    /// point to divert escrow payments after assets have already been set
    /// aside.
    /// @param trust_ The trust to fetch token for.
    function token(address trust_) internal returns (address) {
        address token_ = tokens[trust_];
        if (token_ == address(0)) {
            address trustToken_ = address(Trust(trust_).token());
            require(trustToken_ != address(0), "0_TOKEN");
            tokens[trust_] = trustToken_;
            token_ = trustToken_;
        }
        return token_;
    }

    /// Read the one-way, one-time transition from pending to success/fail.
    /// We never change our opinion of a success/fail outcome.
    /// If a buggy/malicious `Trust` somehow changes success/fail state then
    /// that is obviously bad as the escrow will release funds in the wrong
    /// direction. But if we were to change our opinion that would be worse as
    /// claims/refunds could potentially be "double spent" somehow.
    function escrowStatus(address trust_) internal returns (EscrowStatus) {
        EscrowStatus escrowStatus_ = escrowStatuses[trust_];
        // Short circuit and ignore the `Trust` if we previously saved a value.
        if (escrowStatus_ > EscrowStatus.Pending) {
            return escrowStatus_;
        }
        // We have never seen a success/fail outcome so need to ask the `Trust`
        // for the distribution status.
        else {
            DistributionStatus distributionStatus_ = Trust(trust_)
                .getDistributionStatus();
            // Success maps to success.
            if (distributionStatus_ == DistributionStatus.Success) {
                escrowStatuses[trust_] = EscrowStatus.Success;
                return EscrowStatus.Success;
            }
            // Fail maps to fail.
            else if (distributionStatus_ == DistributionStatus.Fail) {
                escrowStatuses[trust_] = EscrowStatus.Fail;
                return EscrowStatus.Fail;
            }
            // Everything else is still pending.
            else {
                return EscrowStatus.Pending;
            }
        }
    }
}
