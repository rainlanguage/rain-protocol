// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "../libraries/TierUtil.sol";
import { ValueTier } from "./ValueTier.sol";
import "./ReadWriteTier.sol";

/// @title ERC20TransferTier
///
/// The `ERC20TransferTier` takes ownership of an erc20 balance by transferring erc20 token to itself.
/// The `msg.sender` of `setTier` must pay the difference on upgrade, the tiered address receives refunds on downgrade.
/// This allows users to "gift" tiers to each other.
/// As the transfer is a state changing event we can track historical block times.
/// As the tiered address moves up/down tiers it sends/receives the value difference between its current tier only.
///
/// The user is required to preapprove enough erc20 to cover the tier change or they will fail and lose gas.
///
/// ERC20TransferTier is useful for:
/// - Claims that rely on historical holdings so the tiered address cannot simply "flash claim"
/// - Token demand and lockup where liquidity (trading) is a secondary goal
/// - erc20 tokens without additonal restrictions on transfer
contract ERC20TransferTier is ReadWriteTier, ValueTier {
    using SafeERC20 for IERC20;

    IERC20 public immutable erc20;

    /// @param erc20_ The erc20 token contract to transfer balances from/to during `setTier`.
    /// @param tierValues_ 8 values corresponding to minimum erc20 balances for tiers ONE through EIGHT.
    constructor(IERC20 erc20_, uint256[8] memory tierValues_) public ValueTier(tierValues_) {
        erc20 = erc20_;
    }

    /// Transfers balances of erc20 from/to the tiered account according to the difference in values.
    /// Any failure to transfer in/out will rollback the tier change.
    /// The tiered account must ensure sufficient approvals before attempting to set a new tier.
    /// The `msg.sender` is responsible for paying the token cost of a tier increase.
    /// The tiered account is always the recipient of a refund on a tier decrease.
    /// @inheritdoc ReadWriteTier
    function _afterSetTier(
        address account_,
        ITier.Tier startTier_,
        ITier.Tier endTier_,
        bytes memory
    )
        internal
        override
    {
        // As _anyone_ can call `setTier` we require that `msg.sender` and `account_` are the same if the end tier is lower.
        // Anyone can increase anyone else's tier as the `msg.sender` is responsible to pay the difference.
        if (endTier_ < startTier_) {
            require(msg.sender == account_, "DELEGATED_TIER_LOSS");
        }

        // Handle the erc20 transfer.
        // Convert the start tier to an erc20 amount.
        uint256 startValue_ = tierToValue(startTier_);
        // Convert the end tier to an erc20 amount.
        uint256 endValue_ = tierToValue(endTier_);

        // Short circuit if the values are the same for both tiers.
        if (endValue_ == startValue_) {
            return;
        }
        if (endValue_ > startValue_) {
            // Going up, take ownership of erc20 from the `msg.sender`.
            erc20.safeTransferFrom(msg.sender, address(this), SafeMath.sub(
                endValue_,
                startValue_
            ));
        } else {
            // Going down, process a refund for the tiered account.
            erc20.safeTransfer(account_, SafeMath.sub(
                startValue_,
                endValue_
            ));
        }
    }
}