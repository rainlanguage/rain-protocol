// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

interface ITier {
    /**
    * 9 Possible tiers.
    * Fits nicely as uint32 in uint256 which is helpful for internal storage concerns.
    * 8 tiers can be achieved, ZERO is the tier when no tier has been achieved.
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
    * Every time a tier changes we log before and after as a Tier[2] against the account and id.
    **/
    event TierChange(address account, Tier[2] change);

    /**
    * Updates the tier of an account.
    * The implementing contract is responsible for taking any additional actions required to set the tier.
    * For example, taking/refunding funds/NFTs etc.
    *
    * Contracts may disallow directly setting tiers, preferring to derive reports from other onchain data.
    * In this case they should `revert("ERR_SET_TIER");`.
    *
    * @param account Account to change the tier for.
    * @param newTier New tier after the status change.
    * @param data Arbitrary input to disambiguate ownership (e.g. NFTs to lock).
    **/
    function setTier(
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
    * @param account Account to get the report for.
    * @return The report blocks encoded as a uint256.
    **/
    function report(address account) external view returns (uint256);
}