// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "../IVerifyV1.sol";

/// Summary statuses derived from a `State` by comparing the `Since` times
/// against a specific block number.
library VerifyConstants {
    /// Account has not interacted with the system yet or was removed.
    VerifyStatus internal constant STATUS_NIL = VerifyStatus.wrap(0);
    /// Account has added evidence for themselves.
    VerifyStatus internal constant STATUS_ADDED = VerifyStatus.wrap(1);
    /// Approver has reviewed added/approve evidence and approved the account.
    VerifyStatus internal constant STATUS_APPROVED = VerifyStatus.wrap(2);
    /// Banner has reviewed a request to ban an account and banned it.
    VerifyStatus internal constant STATUS_BANNED = VerifyStatus.wrap(3);
}
