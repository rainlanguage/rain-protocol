// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

/// Summary statuses derived from a `State` by comparing the `Since` times
/// against a specific block number.
library VerifyConstants {
    /// Account has not interacted with the system yet or was removed.
    uint256 internal constant STATUS_NIL = 0;
    /// Account has added evidence for themselves.
    uint256 internal constant STATUS_ADDED = 1;
    /// Approver has reviewed added/approve evidence and approved the account.
    uint256 internal constant STATUS_APPROVED = 2;
    /// Banner has reviewed a request to ban an account and banned it.
    uint256 internal constant STATUS_BANNED = 3;
}
