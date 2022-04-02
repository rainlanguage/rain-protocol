// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

uint256 constant ITIER_UNIT_BLOCKS = 0;
uint256 constant ITIER_UNIT_TIMESTAMP = 1;

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
    /// `ITierV2` contracts MUST consistently return the same `units` value for
    /// every call over their lifetime.
    function units() external view returns (uint256);

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
        uint256 tier,
        address account,
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
