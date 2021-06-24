// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC20BalanceTier } from "../tier/ERC20BalanceTier.sol";
import { TierByConstructionClaim } from "../claim/TierByConstructionClaim.sol";
import { ITier } from "../tier/ITier.sol";

contract ClaimERC1155Test is ERC20BalanceTier, TierByConstructionClaim, ERC1155 {
    uint256 public constant ART = 0;
    uint256 public constant GOOD_ART = 1;

    constructor(IERC20 redeemableToken_, uint256[8] memory tierValues_)
        public
        ERC1155("https://example.com/{id}.json")
        TierByConstructionClaim(this, ITier.Tier.THREE)
        ERC20BalanceTier(redeemableToken_, tierValues_) { } // solhint-disable-line no-empty-blocks

    function _afterClaim(
        address account_,
        uint256,
        bytes memory
    ) internal override {
        // Anyone above tier 5 gets more art and some good art.
        bool isFive_ = isTier(account_, Tier.FIVE);

        uint256[] memory ids_ = new uint256[](2);
        uint256[] memory amounts_ = new uint256[](2);

        ids_[0] = (ART);
        ids_[1] = (GOOD_ART);

        amounts_[0] = isFive_ ? 2 : 1;
        amounts_[1] = isFive_ ? 1 : 0;

        // _mintBatch to avoid Reentrancy interleaved with state change from multiple _mint calls.
        // The reentrancy comes from the erc1155 receiver.
        _mintBatch(account_, ids_, amounts_, "");
    }
}