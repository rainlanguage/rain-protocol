// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TierConstants} from "./libraries/TierConstants.sol";
import {ValueTier} from "./ValueTier.sol";
import {ITier} from "./ITier.sol";
import "./ReadOnlyTier.sol";

/// Constructor config for ERC20BalanceTier.
/// @param erc20 The erc20 token contract to check the balance of at `report`
/// time.
/// @param tierValues 8 values corresponding to minimum erc20 balances for
/// tier 1 through tier 8.
struct ERC20BalanceTierConfig {
    IERC20 erc20;
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
/// All tiers held at the current value will be `0x00000000` and tiers not held
/// will be `0xFFFFFFFF`.
/// `setTier` will error as this contract has no ability to write to the erc20
/// contract state.
///
/// IMPORTANT: Simply checking the balance of an unrestricted token is
/// typically INSECURE. If users can transfer tokens freely they can use it
/// to exploit claim, access, voting, etc. by serially granting many accounts
/// some tier simply by transferring or flash-loaning tokens underneath.
/// `ERC20TransferTier` can be used as a partial solution to this problem.
/// See https://github.com/beehive-innovation/rain-protocol/issues/252
///
/// Balance tiers are useful for:
/// - Claim contracts that don't require backdated tier holding
///   (be wary of griefing!).
/// - Assets that cannot be transferred, so are not eligible for
///   `ERC20TransferTier`.
/// - Lightweight, realtime checks that encumber the tiered address
///   as little as possible.
contract ERC20BalanceTier is ReadOnlyTier, ValueTier, Initializable {
    /// Result of initialize.
    /// @param sender `msg.sender` of the initialize.
    /// @param erc20 erc20 token to check balance of.
    event Initialize(address sender, address erc20);

    /// The erc20 to check balances against.
    IERC20 internal erc20;

    /// @param config_ Initialize config.
    function initialize(ERC20BalanceTierConfig memory config_)
        external
        initializer
    {
        initializeValueTier(config_.tierValues);
        erc20 = config_.erc20;
        emit Initialize(msg.sender, address(config_.erc20));
    }

    /// Report simply truncates all tiers above the highest value held.
    /// @inheritdoc ITier
    function report(address account_) public view override returns (uint256) {
        return
            TierReport.truncateTiersAbove(
                TierConstants.ALWAYS,
                valueToTier(tierValues(), erc20.balanceOf(account_))
            );
    }
}
