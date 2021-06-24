// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "./TierUtil.sol";
import { ValueTier } from "./ValueTier.sol";
import "./ReadOnlyTier.sol";

contract ERC20BalanceTier is ReadOnlyTier, ValueTier {
    using SafeERC20 for IERC20;

    IERC20 public token;

    constructor(IERC20 token_, uint256[8] memory tierValues_) public ValueTier(tierValues_) {
        token = token_;
    }

    function report(address account) public view override returns (uint256) {
        return TierUtil.truncateTiersAbove(
            0,
            uint256(valueToTier(token.balanceOf(account)))
        );
    }
}