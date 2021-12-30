// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

library VerifyConstants {
    /// Summary status derived from a `State` by comparing the `xSince` times
    /// against a specific block number.
    uint constant public STATUS_NIL = 0;
    uint constant public STATUS_ADDED = 1;
    uint constant public STATUS_APPROVED = 2;
    uint constant public STATUS_BANNED = 3;
}