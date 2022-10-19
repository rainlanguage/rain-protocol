// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
//solhint-disable-next-line max-line-length
import {TierReport} from "./libraries/TierReport.sol";
import {ValueTier} from "./ValueTier.sol";
import {ITier} from "./ITier.sol";
import {TierConstants} from "./libraries/TierConstants.sol";
import "./ReadOnlyTier.sol";

/// Constructor config for ERC721BalanceTier.
struct ERC721BalanceTierConfig {
    /// The erc721 token contract to check the balance
    /// of at `report` time.
    IERC721 erc721;
    /// 8 values corresponding to minimum erc721
    /// balances for tier 1 through tier 8.
    uint256[8] tierValues;
}

/// @title ERC721BalanceTier
/// @notice `ERC721BalanceTier` inherits from `ReadOnlyTier`.
///
/// There is no internal accounting, the balance tier simply reads the balance
/// of the user whenever `report` is called.
///
/// `setTier` always fails.
///
/// There is no historical information so each tier will either be `0x00000000`
/// or `0xFFFFFFFF` for the block number.
///
/// @dev The `ERC721BalanceTier` simply checks the current balance of an erc721
/// against tier values. As the current balance is always read from the erc721
/// contract directly there is no historical block data.
/// All tiers held at the current value will be `0x00000000` and tiers not held
/// will be `0xFFFFFFFF`.
/// `setTier` will error as this contract has no ability to write to the erc721
/// contract state.
///
/// Balance tiers are useful for:
/// - Claim contracts that don't require backdated tier holding
///   (be wary of griefing!).
/// - Assets that cannot be transferred, so are not eligible for
///   `ERC721TransferTier`.
/// - Lightweight, realtime checks that encumber the tiered address
///   as little as possible.
contract ERC721BalanceTier is ReadOnlyTier, ValueTier, Initializable {
    
    event Initialize(
        /// `msg.sender` of the initialize.
        address sender,
        /// erc20 to transfer.
        address erc721
    );

    IERC721 public erc721;

    /// @param config_ Initialize config.
    function initialize(ERC721BalanceTierConfig memory config_)
        external
        initializer
    {
        initializeValueTier(config_.tierValues);
        erc721 = config_.erc721;
        emit Initialize(msg.sender, address(config_.erc721));
    }

    /// Report simply truncates all tiers above the highest value held.
    /// @inheritdoc ITier
    function report(address account_) public view override returns (uint256) {
        return
            TierReport.truncateTiersAbove(
                TierConstants.ALWAYS,
                valueToTier(tierValues(), erc721.balanceOf(account_))
            );
    }
}
