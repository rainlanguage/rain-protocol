// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "./TierUtil.sol";
import { ValueTier } from "./ValueTier.sol";
import "./ReadOnlyTier.sol";

contract ERC20BalanceTier is ReadOnlyTier, ValueTier {
    using SafeERC20 for IERC20;

    IERC20 public token;

    constructor(IERC20 _token, uint256[8] memory _tierValues) public ValueTier(_tierValues) {
        token = _token;
    }

    function report(address account) public view override returns (uint256) {
        return TierUtil.truncateTiersAbove(
            0,
            uint256(valueToTier(token.balanceOf(account)))
        );
    }
}