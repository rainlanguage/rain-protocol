// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

/// @title ITier
/// Standard interface to a tiered membership.
///
/// A "membership" can represent many things:
/// - Exclusive access
/// - Participation in some event or process
/// - KYC completion
/// - Combination of sub-memberships
/// - Etc.
///
/// The high level requirements for a contract implementing ITier:
/// - MUST represent held tiers with the `Tier` enum.
/// - MUST implement `report`.
///   - The report is a `uint256` that represents the block each tier was has been continuously held since encoded as `uint32`.
///   - The encoded tiers start at ONE and ZERO is implied if no tier has ever been held.
///   - If a tier is lost the block data is erased for that tier and will be reset if/when the tier is regained to that new block.
/// - SHOULD implement `setTier`.
///   - Contracts SHOULD revert with a meaningful error if they cannot meaningfully set a tier directly.
///     For example a contract that can only derive a membership tier by reading the state of an external contract cannot set tiers.
/// - MUST emit `TierChange` when `setTier` successfully writes a new tier.
///   - Contracts that cannot meaningfully set a tier are exempt.
interface ITier {
    /// 9 Possible tiers.
    /// Fits nicely as uint32 in uint256 which is helpful for internal storage concerns.
    /// 8 tiers can be achieved, ZERO is the tier when no tier has been achieved.
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

    /// Every time a tier changes we log before and after as a Tier[2] against the account and id.
    event TierChange(address account, Tier[2] change);

    /// Updates the tier of an account.
    /// The implementing contract is responsible for taking any additional actions required to set the tier.
    /// For example, taking/refunding funds/NFTs etc.
    ///
    /// Contracts may disallow directly setting tiers, preferring to derive reports from other onchain data.
    /// In this case they should `revert("ERR_SET_TIER");`.
    ///
    /// @param account Account to change the tier for.
    /// @param newTier New tier after the status change.
    /// @param data Arbitrary input to disambiguate ownership (e.g. NFTs to lock).
    function setTier(
        address account,
        Tier newTier,
        bytes memory data
    )
        external;

    /// Returns the earliest block the account has held each tier for continuously.
    /// This is encoded as a uint256 with blocks represented as 8x concatenated u32.
    /// I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
    /// The low bits represent low tiers and high bits the high tiers.
    /// Implementing contracts should return 0xFFFFFFFF for lost & never-held tiers.
    ///
    /// @param account Account to get the report for.
    /// @return The report blocks encoded as a uint256.
    function report(address account) external view returns (uint256);
}