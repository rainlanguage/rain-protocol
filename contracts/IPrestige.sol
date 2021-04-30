// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

interface IPrestige {
    enum Status {
        COPPER,
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM,
        DIAMOND,
        CHAD,
        JAWAD
    }

    event StatusChange(address account, Status[2] change);

    /**
    *   Updates the level of an account by an entered level
    *   address account - Account to change the status.
    *   Status new_status - New status to be changed.
    *   bytes - Arbitrary input to disambiguate ownership (e.g. NFTs to lock).
    **/
    function setStatus(address account, Status newStatus, bytes memory data) external;

    // Returns the earliest block the account has held each status for continuously.
    // This is encoded as a uint256 with blocks represented as 8x concatenated u32.
    // I.e. Each 4 bytes of the uint256 represents a u32 status start time.
    // The low bits represent low status and high bits the high status.
    function statusReport(address account) external view returns (uint256);
}