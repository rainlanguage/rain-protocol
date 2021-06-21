// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "./TierUtil.sol";
import "./ReadWriteTier.sol";

contract ERC20TransferTier is ReadWriteTier {
    using SafeERC20 for IERC20;

    IERC20 public erc20;
    uint256[8] public levels;

    constructor(IERC20 _erc20, uint256[8] memory _levels) public {
        erc20 = _erc20;
        levels = _levels;
    }

    function tierValue(Tier _tier) view private returns(uint256) {
        if (uint256(_tier) > 0) {
            return levels[uint256(_tier)];
        } else {
            return 0;
        }
    }

    function _afterSetTier(
        address _account,
        ITier.Tier _oldTier,
        ITier.Tier _newTier,
        bytes memory
    )
        internal
        override
    {
        // Handle the ERC20 transfer.
        // Convert the current tier to an ERC20 amount.
        uint256 _oldTierValue = tierValue(_oldTier);
        // Convert the new tier to an ERC20 amount.
        uint256 _newTierValue = tierValue(_newTier);

        if (_newTierValue >= _oldTierValue) {
            // Going up, take ownership of TVK.
            erc20.safeTransferFrom(_account, address(this), SafeMath.sub(
                _newTierValue,
                _oldTierValue
            ));
        } else {
            // Going down, process a refund.
            erc20.safeTransfer(_account, SafeMath.sub(
                _oldTierValue,
                _newTierValue
            ));
        }
    }
}