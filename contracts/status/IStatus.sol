// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

interface IStatus {
    /**
    * 9 Possible tiers.
    * Fits nicely as uint32 in uint256 which is helpful for internal storage concerns.
    * 8 tiers can be achieved, ZERO is the status when no tier has been achieved.
    **/
    enum Tier {
        ZERO,
        ONE,
        TWO,
        THREE,
        FOUR,
        FIVE,
        SIX,
        SEVEN,
        EIGHT
    }

    /**
    * Every time a status changes we log before and after as a Tier[2] against the account.
    **/
    event StatusChange(uint256 id, address account, Tier[2] change);

    /**
    * Updates the status of an account to a given tier.
    * The implementing contract is responsible for taking any actions required to set the status.
    * For example, taking/refunding funds/NFTs etc.
    *
    * @param id Arbitrary ID to support multi-status contracts.
    * @param account Account to change the status for.
    * @param newTier New tier after the status change.
    * @param data Arbitrary input to disambiguate ownership (e.g. NFTs to lock).
    **/
    function setStatus(
        uint256 id,
        address account,
        Tier newTier,
        bytes memory data
    )
        external;

    /**
    * Returns the earliest block the account has held each tier for continuously.
    * This is encoded as a uint256 with blocks represented as 8x concatenated u32.
    * I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
    * The low bits represent low tiers and high bits the high tiers.
    * Implementing contracts should return 0xFFFFFFFF for lost & never-held tiers.
    *
    * @param id Arbitrary ID to support multi-status contracts.
    * @param account Account to get the report for.
    * @return The status report blocks encoded as a uint256.
    **/
    function statusReport(uint256 id, address account) external view returns (uint256);
}