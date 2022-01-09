// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ERC20Redeem {
    using SafeERC20 for IERC20;

    event Redeem(
        address sender,
        address treasuryAsset,
        uint256 reserveAmount,
        uint256 assetAmount
    );

    event TreasuryAsset(address sender, address asset);

    /// Anon can emit a `TreasuryAsset` event to notify token holders that
    /// an asset could be redeemed by burning `RedeemableERC20` tokens.
    /// As this is callable by anon the events should be filtered by the
    /// indexer to those from trusted entities only.
    /// @param newTreasuryAsset_ The asset to log.
    function newTreasuryAsset(address newTreasuryAsset_) public {
        emit TreasuryAsset(msg.sender, newTreasuryAsset_);
    }

    function _redeem(IERC20[] memory treasuryAssets_, uint256 redeemAmount_)
        internal
    {
        uint256 assetsLength_ = treasuryAssets_.length;

        // Calculate everything before any balances change.
        uint256[] memory amounts_ = new uint256[](treasuryAssets_.length);

        // The fraction of the assets we release is the fraction of the
        // outstanding total supply of the redeemable being burned.
        // Every treasury asset is released in the same proportion.
        uint256 totalSupply_ = IERC20(address(this)).totalSupply();
        for (uint256 i_ = 0; i_ < amounts_.length; i_++) {
            amounts_[i_] =
                (treasuryAssets_[i_].balanceOf(address(this)) *
                    redeemAmount_) /
                totalSupply_;
        }

        // Guard against no asset redemptions.
        require(assetsLength_ > 0, "EMPTY_ASSETS");
        for (uint i_ = 0; i_ < assetsLength_; i_++) {
            require(amounts_[i_] > 0, "ZERO_AMOUNT");
        }

        // Burn FIRST.
        // This assumes implementing contract has implemented the interface.
        IERC20Burnable(address(this)).burn(redeemAmount_);

        // Then emit all events.
        for (uint256 i_ = 0; i_ < assetsLength_; i_++) {
            emit Redeem(
                msg.sender,
                address(treasuryAssets_[i_]),
                redeemAmount_,
                amounts_[i_]
            );
        }

        // Then send all assets.
        for (uint256 i_ = 0; i_ < assetsLength_; i_++) {
            treasuryAssets_[i_].safeTransfer(msg.sender, amounts_[i_]);
        }
    }
}
