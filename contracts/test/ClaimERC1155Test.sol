// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC20BalanceTier } from "../tier/ERC20BalanceTier.sol";
import { TierByConstructionClaim } from "../claim/TierByConstructionClaim.sol";
import { ITier } from "../tier/ITier.sol";

contract ClaimERC1155Test is ERC20BalanceTier, TierByConstructionClaim, ERC1155 {
    uint256 public constant ART = 0;
    uint256 public constant GOOD_ART = 1;

    constructor(IERC20 _redeemableToken, uint256[9] memory _levels)
        public
        ERC1155("https://example.com/{id}.json")
        TierByConstructionClaim(this, ITier.Tier.THREE)
        ERC20BalanceTier(_redeemableToken, _levels) { } // solhint-disable-line no-empty-blocks

    function _afterClaim(
        address _account,
        uint256,
        bytes memory
    ) internal override {
        // Anyone with tier THREE status (set in the constructor) since construction gets some art.
        _mint(_account, ART, 1, "");

        // Anyone with tier FIVE since construction gets another art, and some good art.
        if (isTier(_account, Tier.FIVE)) {
            _mint(_account, ART, 1, "");
            _mint(_account, GOOD_ART, 1, "");
        }
    }
}