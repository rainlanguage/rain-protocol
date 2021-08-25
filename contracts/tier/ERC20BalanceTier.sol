// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "../libraries/TierUtil.sol";
import { ValueTier } from "./ValueTier.sol";
import "./ReadOnlyTier.sol";

/// @title ERC20BalanceTier
///
/// The `ERC20BalanceTier` simply checks the current balance of an erc20 against tier values.
/// As the current balance is always read from the erc20 contract directly there is no historical block data.
/// All tiers held at the current value will be 0x00000000 and tiers not held will be 0xFFFFFFFF.
/// `setTier` will error as this contract has no ability to write to the erc20 contract state.
///
/// Balance tiers are useful for:
/// - Claim contracts that don't require backdated tier holding (be wary of griefing!).
/// - Assets that cannot be transferred, so are not eligible for `ERC20TransferTier`.
/// - Lightweight, realtime checks that encumber the tiered address as little as possible.
contract ERC20BalanceTier is ReadOnlyTier, ValueTier {
    IERC20 public immutable erc20;

    /// @param erc20_ The erc20 token contract to check the balance of at `report` time.
    /// @param tierValues_ 8 values corresponding to minimum erc20 balances for tiers ONE through EIGHT.
    constructor(IERC20 erc20_, uint256[8] memory tierValues_) public ValueTier(tierValues_) {
        erc20 = erc20_;
    }

    /// Report simply truncates all tiers above the highest value held.
    /// @inheritdoc ITier
    function report(address account_) public view override returns (uint256) {
        return TierUtil.truncateTiersAbove(
            0,
            valueToTier(erc20.balanceOf(account_))
        );
    }
}