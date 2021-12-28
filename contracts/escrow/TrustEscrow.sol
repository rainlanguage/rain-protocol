// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Trust, DistributionStatus } from "../trust/Trust.sol";
import { FactoryTruster } from "../factory/FactoryTruster.sol";

enum EscrowStatus {
    /// Important this is the first item in the enum as inequality is used to
    /// check pending vs. pass/fail in security sensitive code.
    Pending,
    /// The underlying `Trust` distribution failed.
    Fail,
    /// The underlying `Trust` distribution succeeded.
    Success
}

/// @title TrustEscrow
abstract contract TrustEscrow is FactoryTruster {
    EscrowStatus private escrowStatus = EscrowStatus.Pending;

    /// @param trustFactory_ `TrustFactory` that every `Trust` MUST be a child
    /// of. The security model of the escrow REQUIRES that the `TrustFactory`
    /// implements `IFactory` correctly and that the `Trust` contracts that it
    /// deploys are not buggy or malicious re: tracking distribution status.
    constructor(address trustFactory_) FactoryTruster(trustFactory_)
        {} //solhint-disable-line no-empty-blocks

    /// Read the one-way, one-time transition from pending to pass/fail.
    /// We never change our opinion of a pass/fail outcome.
    /// If a buggy/malicious `Trust` somehow changes pass/fail state then that
    /// is obviously bad as the escrow will release funds in the wrong
    /// direction. But if we were to change our opinion that would be worse as
    /// claims/refunds could be attempted to be "double spent" somehow.
    function getEscrowStatus(Trust trust_)
        public
        // Only want to be calling external functions on `Trust` that we trust.
        onlyTrustedFactoryChild(address(trust_))
        returns(EscrowStatus)
    {
        EscrowStatus escrowStatus_ = escrowStatus;
        // Short circuit and ignore the `Trust` if we previously saved a value.
        if (escrowStatus > EscrowStatus.Pending) {
            return escrowStatus_;
        }
        // We have never seen a pass/fail outcome so need to ask the `Trust`
        // for the distribution status.
        else {
            // This is technically reentrant, but we trust the `Trust` right?
            // For the paranoid, wrap `getEscrowStatus` in a reentrancy guard.
            DistributionStatus distributionStatus_
                = trust_.getDistributionStatus();
            // Success maps to success.
            if (distributionStatus_ == DistributionStatus.Success) {
                escrowStatus = EscrowStatus.Success;
                return EscrowStatus.Success;
            }
            // Fail maps to fail.
            else if (distributionStatus_ == DistributionStatus.Fail) {
                escrowStatus = EscrowStatus.Fail;
                return EscrowStatus.Fail;
            }
            // Everything else is still pending.
            else {
                return EscrowStatus.Pending;
            }
        }
    }
}