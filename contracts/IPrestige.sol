// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

interface IPrestige {
    enum Status {
        Copper,
        Bronze,
        Silver,
        Gold,
        Platinum,
        Diamond,
        Chad,
        Jawad
    }

    event StatusChange(address account, Status[2] change);

    function set_status(address account, Status new_status, bytes memory data) external;

    // Returns the earliest block the account has held each status for continuously.
    // This is encoded as a uint256 with blocks represented as 8x concatenated u32.
    // I.e. Each 4 bytes of the uint256 represents a u32 status start time.
    // The low bits represent low status and high bits the high status.
    function status_report(address account) external view returns (uint256);
}