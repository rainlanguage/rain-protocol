// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../sale/ISale.sol";

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
/// An escrow that is designed to work with `ISale` results.
/// `getEscrowStatus` wraps the `ISale.saleStatus` to guarantee that a
/// success/fail result is one-way. Even if some bug in the `Sale` causes the
/// success/fail status to flip, this will not result in the escrow double
/// spending or otherwise changing the direction that it sends funds.
/// The first time the `SaleEscrow` observes a non-pending status it will
/// snapshot the success/fail permanently.
contract SaleEscrow {
    mapping(ISale => EscrowStatus) private escrowStatuses;

    /// Read the one-way, one-time transition from pending to success/fail.
    /// We never change our opinion of a success/fail outcome.
    /// If a buggy/malicious `Sale` somehow changes success/fail state then
    /// that is obviously bad as the escrow will release funds in the wrong
    /// direction. But if we were to change our opinion that would be worse as
    /// claims/refunds could potentially be "double spent" somehow.
    /// @param sale_ The sale to check and maybe snapshot the status from.
    function getEscrowStatus(ISale sale_) public returns (EscrowStatus) {
        EscrowStatus escrowStatus_ = escrowStatuses[sale_];
        // Short circuit and ignore the `Sale` if we previously saved a value.
        if (escrowStatus_ > EscrowStatus.Pending) {
            return escrowStatus_;
        }
        // We have never seen a success/fail outcome so need to ask the `Sale`
        // for the distribution status.
        else {
            SaleStatus saleStatus_ = sale_.saleStatus();
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
