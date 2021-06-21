// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "./TierUtil.sol";
import "./ReadOnlyTier.sol";

contract ERC20BalanceTier is ReadOnlyTier {
    using SafeERC20 for IERC20;

    IERC20 public token;
    uint256[9] public levels;

    constructor(IERC20 _token, uint256[9] memory _levels) public {
        token = _token;
        levels = _levels;
    }

    function report(address account) public view override returns (uint256) {
        uint256 _accountBalance = token.balanceOf(account);
        uint256 _report;
        uint256[9] memory _levels = levels;
        uint256 i;
        for (i; i < _levels.length; i++) {
            if(_levels[i] > _accountBalance) {
                break;
            }
        }
        if (i > 0) {
            return TierUtil.truncateTiersAbove(_report, i);
        }
        else {
            return TierUtil.UNINITIALIZED;
        }
    }
}