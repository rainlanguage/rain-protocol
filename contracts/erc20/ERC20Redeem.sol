// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract ERC20Redeem is ERC20BurnableUpgradeable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// Anon has burned their tokens in exchange for some treasury assets.
    /// Emitted once per redeemed asset.
    /// @param sender `msg.sender` is burning.
    /// @param treasuryAsset Treasury asset being sent to redeemer.
    /// @param redeemAmount Amount of token being burned.
    /// @param assetAmount Amount of treasury asset being sent.
    event Redeem(
        address sender,
        address treasuryAsset,
        uint256 redeemAmount,
        uint256 assetAmount
    );

    /// Anon can notify the world that they are adding treasury assets to the
    /// contract. Indexers are strongly encouraged to ignore untrusted anons.
    /// @param sender `msg.sender` adding a treasury asset.
    /// @param asset The treasury asset being added.
    event TreasuryAsset(address sender, address asset);

    /// Anon can emit a `TreasuryAsset` event to notify token holders that
    /// an asset could be redeemed by burning `RedeemableERC20` tokens.
    /// As this is callable by anon the events should be filtered by the
    /// indexer to those from trusted entities only.
    /// @param newTreasuryAsset_ The asset to log.
    function newTreasuryAsset(address newTreasuryAsset_) public {
        emit TreasuryAsset(msg.sender, newTreasuryAsset_);
    }

    /// Burn tokens for a prorata share of the current treasury.
    ///
    /// The assets to be redeemed for must be specified as an array. This keeps
    /// the redeem functionality:
    /// - Gas efficient as we avoid tracking assets in storage
    /// - Decentralised as any user can deposit any asset to be redeemed
    /// - Error resistant as any individual asset reverting can be avoided by
    ///   redeeming againt sans the problematic asset.
    /// It is also a super sharp edge if someone burns their tokens prematurely
    /// or with an incorrect asset list. Implementing contracts are strongly
    /// encouraged to implement additional safety rails to prevent high value
    /// mistakes.
    /// Only "vanilla" erc20 token balances are supported as treasury assets.
    /// I.e. if the balance is changing such as due to a rebasing token or
    /// other mechanism then the WRONG token amounts will be redeemed. The
    /// redemption calculation is very simple and naive in that it takes the
    /// current balance of this contract of the assets being claimed via
    /// redemption to calculate the "prorata" entitlement. If the contract's
    /// balance of the claimed token is changing between redemptions (other
    /// than due to the redemption itself) then each redemption will send
    /// incorrect amounts.
    /// @param treasuryAssets_ The list of assets to redeem.
    /// @param redeemAmount_ The amount of redeemable token to burn.
    function _redeem(
        IERC20[] memory treasuryAssets_,
        uint256 redeemAmount_
    ) internal {
        uint256 assetsLength_ = treasuryAssets_.length;

        // Calculate everything before any balances change.
        uint256[] memory amounts_ = new uint256[](assetsLength_);

        // The fraction of the assets we release is the fraction of the
        // outstanding total supply of the redeemable being burned.
        // Every treasury asset is released in the same proportion.
        // Guard against no asset redemptions and log all events before we
        // change any contract state or call external contracts.
        require(assetsLength_ > 0, "EMPTY_ASSETS");
        uint256 supply_ = IERC20(address(this)).totalSupply();
        uint256 amount_ = 0;
        for (uint256 i_ = 0; i_ < assetsLength_; i_++) {
            amount_ = treasuryAssets_[i_].balanceOf(address(this)).mulDiv(
                redeemAmount_,
                supply_
            );
            require(amount_ > 0, "ZERO_AMOUNT");
            emit Redeem(
                msg.sender,
                address(treasuryAssets_[i_]),
                redeemAmount_,
                amount_
            );
            amounts_[i_] = amount_;
        }

        // Burn FIRST (reentrancy safety).
        _burn(msg.sender, redeemAmount_);

        // THEN send all assets.
        for (uint256 i_ = 0; i_ < assetsLength_; i_++) {
            treasuryAssets_[i_].safeTransfer(msg.sender, amounts_[i_]);
        }
    }
}
