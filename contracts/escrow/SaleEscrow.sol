// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../sale/ISaleV2.sol";

/// Represents the 3 possible statuses an escrow could care about.
/// Either the escrow takes no action or consistently allows a success/fail
/// action.
enum EscrowStatus {
    /// The underlying `Sale` has not reached a definitive pass/fail state.
    /// Important this is the first item in the enum as inequality is used to
    /// check pending vs. pass/fail in security sensitive code.
    Pending,
    /// The underlying `Sale` distribution failed.
    Fail,
    /// The underlying `Sale` distribution succeeded.
    Success
}

/// @title SaleEscrow
/// An escrow that is designed to work with untrusted `Sale` bytecode.
/// `escrowStatus` wraps `Sale` functions to guarantee that results do not
/// change. Reserve and token addresses never change for a given `Sale` and
/// a pass/fail result is one-way. Even if some bug in the `Sale` causes the
/// pass/fail status to flip, this will not result in the escrow double
/// spending or otherwise changing the direction that it sends funds.
contract SaleEscrow {
    /// ISale address => reserve address.
    mapping(address => address) internal reserves;
    /// ISale address => token address.
    mapping(address => address) internal tokens;
    /// ISale address => status.
    mapping(address => EscrowStatus) internal escrowStatuses;

    /// Immutable wrapper around `ISale.reserve`.
    /// Once a `Sale` reports a reserve address the `SaleEscrow` never asks
    /// again. Prevents a malicious `Sale` from changing the reserve at some
    /// point to break internal escrow accounting.
    /// @param sale_ The ISale to fetch reserve for.
    function reserve(address sale_) internal returns (address) {
        address reserve_ = reserves[sale_];
        if (reserve_ == address(0)) {
            address saleReserve_ = address(ISaleV2(sale_).reserve());
            require(saleReserve_ != address(0), "0_RESERVE");
            reserves[sale_] = saleReserve_;
            reserve_ = saleReserve_;
        }
        return reserve_;
    }

    /// Immutable wrapper around `ISale.token`.
    /// Once a `Sale` reports a token address the `SaleEscrow` never asks
    /// again. Prevents a malicious `Sale` from changing the token at some
    /// point to divert escrow payments after assets have already been set
    /// aside.
    /// @param sale_ The ISale to fetch token for.
    function token(address sale_) internal returns (address) {
        address token_ = tokens[sale_];
        if (token_ == address(0)) {
            address saleToken_ = address(ISaleV2(sale_).token());
            require(saleToken_ != address(0), "0_TOKEN");
            tokens[sale_] = saleToken_;
            token_ = saleToken_;
        }
        return token_;
    }

    /// Read the one-way, one-time transition from pending to success/fail.
    /// We never change our opinion of a success/fail outcome.
    /// If a buggy/malicious `ISale` somehow changes success/fail state then
    /// that is obviously bad as the escrow will release funds in the wrong
    /// direction. But if we were to change our opinion that would be worse as
    /// claims/refunds could potentially be "double spent" somehow.
    /// @param sale_ The sale to get the escrow status for.
    function escrowStatus(address sale_) internal returns (EscrowStatus) {
        EscrowStatus escrowStatus_ = escrowStatuses[sale_];
        // Short circuit and ignore the `ISale` if we previously saved a value.
        if (escrowStatus_ > EscrowStatus.Pending) {
            return escrowStatus_;
        }
        // We have never seen a success/fail outcome so need to ask the `ISale`
        // for the distribution status.
        else {
            SaleStatus saleStatus_ = ISaleV2(sale_).saleStatus();
            // Success maps to success.
            if (saleStatus_ == SaleStatus.Success) {
                escrowStatuses[sale_] = EscrowStatus.Success;
                return EscrowStatus.Success;
            }
            // Fail maps to fail.
            else if (saleStatus_ == SaleStatus.Fail) {
                escrowStatuses[sale_] = EscrowStatus.Fail;
                return EscrowStatus.Fail;
            }
            // Everything else is still pending.
            else {
                return EscrowStatus.Pending;
            }
        }
    }
}
