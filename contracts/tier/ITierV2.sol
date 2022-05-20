// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

uint256 constant ITIER_UNIT_BLOCKS = 0;
uint256 constant ITIER_UNIT_TIMESTAMP = 1;

/// @title ITierV2
/// @notice `ITierV2` is a simple interface that contracts can
/// implement to provide membership lists for other contracts.
///
/// There are many use-cases for a time-preserving conditional membership list.
///
/// Some examples include:
///
/// - Self-serve whitelist to participate in fundraising
/// - Lists of users who can claim airdrops and perks
/// - Pooling resources with implied governance/reward tiers
/// - POAP style attendance proofs allowing access to future exclusive events
///
/// @dev Standard interface to a tiered membership.
///
/// A "membership" can represent many things:
/// - Exclusive access.
/// - Participation in some event or process.
/// - KYC completion.
/// - Combination of sub-memberships.
/// - Etc.
///
/// The high level requirements for a contract implementing `ITierV2`:
/// - MUST represent held tiers as a `uint`.
/// - MUST implement `report`.
///   - The report is a `uint256` that SHOULD represent the block each tier has
///     been continuously held since encoded as `uint32`.
///   - The encoded tiers start at `1`; Tier `0` is implied if no tier has ever
///     been held.
///   - Tier `0` is NOT encoded in the report, it is simply the fallback value.
///   - If a tier is lost the block data is erased for that tier and will be
///     set if/when the tier is regained to the new block.
///   - If a tier is held but the historical block information is not available
///     the report MAY return `0x00000000` for all held tiers.
///   - Tiers that are lost or have never been held MUST return `0xFFFFFFFF`.
/// - SHOULD implement `setTier`.
///   - Contracts SHOULD revert with `SET_TIER` error if they cannot
///     meaningfully set a tier directly.
///     For example a contract that can only derive a membership tier by
///     reading the state of an external contract cannot set tiers.
///   - Contracts implementing `setTier` SHOULD error with `SET_ZERO_TIER`
///     if tier 0 is being set.
/// - MUST emit `TierChange` when `setTier` successfully writes a new tier.
///   - Contracts that cannot meaningfully set a tier are exempt.
///
/// So the four possible states and report values are:
/// - Tier is held and block is known: Block is in the report
/// - Tier is held but block is NOT known: `0` is in the report
/// - Tier is NOT held: `0xFF..` is in the report
/// - Tier is unknown: `0xFF..` is in the report
interface ITierV2 {
    /// Return `0` for blocks and `1` for unix timestamps in seconds.
    /// Given that both can comfortably fit in uint32 until at least the year
    /// 2100 (assuming block times longer than 1 second), we should be safe to
    /// calculate reports in terms of either.
    /// What is NEVER safe however, is mixing blocks and timestamps. There is
    /// no direct conversion between the two as each block takes a different
    /// amount of time to produce.
    /// All standard caveats re: timestamps on the blockchain apply such as:
    /// - Times are monotonic and unique but can be manipulated by miners. The
    ///   degree to which all three of these statements are true is up to the
    ///   network.
    /// - Popular languages such as JavaScript often work with timestamps in
    ///   milliseconds and teams have vested/locked tokens for 1000 years by
    ///   miscalculating this; a tiny mistake can be enough to kill a project.
    /// Offchain tooling such as that which builds scripts to combine the
    /// output of several reports is STRONGLY RECOMMENDED to ensure different
    /// units are NEVER mixed.
    /// `ITierV2` contracts MUST consistently return the same units for
    /// every call over their lifetime.
    function reportUnit() external view returns (uint256);

    /// Same as report but for a single tier.
    /// Often the implementing contract can calculate a single tier much more
    /// efficiently than all 8 tiers. If the consumer only needs one or a few
    /// tiers it MAY be much cheaper to request only those tiers individually.
    /// This DOES NOT apply to all contracts, an obvious example is token
    /// balance based tiers which always return `ALWAYS` or `NEVER` for all
    /// tiers so no efficiency is gained.
    /// The return value is a `uint256` for gas efficiency but the values will
    /// be bounded by `type(uint32).max` as no single tier can report a value
    /// higher than this.
    function reportForTier(
        address account,
        uint256 tier,
        bytes calldata data
    ) external view returns (uint256);

    /// Same as `ITier` but with arbitrary bytes for `data` which allows a
    /// single underlying state to present many different reports dynamically.
    ///
    /// For example:
    /// - Staking ledgers can calculate different tier thresholds
    /// - NFTs can give different tiers based on different IDs
    /// - Snapshot ERC20s can give different reports based on snapshot ID
    ///
    /// `data` supercedes `setTier` function and `TierChange` event from
    /// `ITier` at the interface level. Implementing contracts are free to
    /// inherit both `ITier` and `ITierV2` if the old behaviour is desired.
    function report(address account, bytes calldata data)
        external
        view
        returns (uint256);
}
