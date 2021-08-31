// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

/// @title ITier
/// Standard interface to a tiered membership.
///
/// A "membership" can represent many things:
/// - Exclusive access.
/// - Participation in some event or process.
/// - KYC completion.
/// - Combination of sub-memberships.
/// - Etc.
///
/// The high level requirements for a contract implementing ITier:
/// - MUST represent held tiers with the `Tier` enum.
/// - MUST implement `report`.
///   - The report is a `uint256` that SHOULD represent the block each tier has been continuously held since encoded as `uint32`.
///   - The encoded tiers start at ONE; ZERO is implied if no tier has ever been held.
///   - Tier ZERO is NOT encoded in the report, it is simply the fallback value.
///   - If a tier is lost the block data is erased for that tier and will be set if/when the tier is regained to the new block.
///   - If the historical block information is not available the report MAY return `0x00000000` for all held tiers.
///   - Tiers that are lost or have never been held MUST return `0xFFFFFFFF`.
/// - SHOULD implement `setTier`.
///   - Contracts SHOULD revert with `SET_TIER` error if they cannot meaningfully set a tier directly.
///     For example a contract that can only derive a membership tier by reading the state of an external contract cannot set tiers.
///   - Contracts implementing `setTier` SHOULD error with `SET_ZERO_TIER` if `Tier.ZERO` is being set.
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

    /// Every time a Tier changes we log start and end Tier against the account.
    /// This MAY NOT be emitted if reports are being read from the state of an external contract.
    event TierChange(
        address indexed account,
        Tier indexed startTier,
        Tier indexed endTier
    );

    /// Updates the tier of an account.
    ///
    /// The implementing contract is responsible for all checks and state changes required to set the tier.
    /// For example, taking/refunding funds/NFTs etc.
    ///
    /// Contracts may disallow directly setting tiers, preferring to derive reports from other onchain data.
    /// In this case they should `revert("SET_TIER");`.
    ///
    /// @param account Account to change the tier for.
    /// @param endTier Tier after the change.
    /// @param data Arbitrary input to disambiguate ownership (e.g. NFTs to lock).
    function setTier(
        address account,
        Tier endTier,
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