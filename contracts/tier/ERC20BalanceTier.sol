// SPDX-License-Identifier: CAL

pragma solidity ^0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TierReport } from "./libraries/TierReport.sol";
import { ValueTier } from "./ValueTier.sol";
import { ITier } from "./ITier.sol";
import "./ReadOnlyTier.sol";

/// Constructor config for ERC20BalanceTier.
struct ERC20BalanceTierConfig {
    /// The erc20 token contract to check the balance
    /// of at `report` time.
    IERC20 erc20;
    /// 8 values corresponding to minimum erc20
    /// balances for `Tier.ONE` through `Tier.EIGHT`.
    uint256[8] tierValues;
}

/// @title ERC20BalanceTier
/// @notice `ERC20BalanceTier` inherits from `ReadOnlyTier`.
///
/// There is no internal accounting, the balance tier simply reads the balance
/// of the user whenever `report` is called.
///
/// `setTier` always fails.
///
/// There is no historical information so each tier will either be `0x00000000`
/// or `0xFFFFFFFF` for the block number.
///
/// @dev The `ERC20BalanceTier` simply checks the current balance of an erc20
/// against tier values. As the current balance is always read from the erc20
/// contract directly there is no historical block data.
/// All tiers held at the current value will be 0x00000000 and tiers not held
/// will be 0xFFFFFFFF.
/// `setTier` will error as this contract has no ability to write to the erc20
/// contract state.
///
/// Balance tiers are useful for:
/// - Claim contracts that don't require backdated tier holding
///   (be wary of griefing!).
/// - Assets that cannot be transferred, so are not eligible for
///   `ERC20TransferTier`.
/// - Lightweight, realtime checks that encumber the tiered address
///   as little as possible.
contract ERC20BalanceTier is ReadOnlyTier, ValueTier {
    IERC20 public immutable erc20;

    /// @param config_ Constructor config.
    constructor(ERC20BalanceTierConfig memory config_)
        ValueTier(config_.tierValues)
    {
        erc20 = config_.erc20;
    }

    /// Report simply truncates all tiers above the highest value held.
    /// @inheritdoc ITier
    function report(address account_) public view override returns (uint256) {
        return TierReport.truncateTiersAbove(
            0,
            valueToTier(erc20.balanceOf(account_))
        );
    }
}