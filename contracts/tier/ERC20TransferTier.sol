// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TierUtil } from "./TierUtil.sol";
import { ValueTier } from "./ValueTier.sol";
import "./ReadWriteTier.sol";

contract ERC20TransferTier is ReadWriteTier, ValueTier {
    using SafeERC20 for IERC20;

    IERC20 public erc20;

    constructor(IERC20 _erc20, uint256[8] memory _tierValues) public ValueTier(_tierValues) {
        erc20 = _erc20;
    }

    function _afterSetTier(
        address _account,
        ITier.Tier _startTier,
        ITier.Tier _endTier,
        bytes memory
    )
        internal
        override
    {
        // Handle the ERC20 transfer.
        // Convert the start tier to an ERC20 amount.
        uint256 _startValue = tierToValue(_startTier);
        // Convert the end tier to an ERC20 amount.
        uint256 _endValue = tierToValue(_endTier);

        if (_endValue >= _startValue) {
            // Going up, take ownership of TVK.
            erc20.safeTransferFrom(_account, address(this), SafeMath.sub(
                _endValue,
                _startValue
            ));
        } else {
            // Going down, process a refund.
            erc20.safeTransfer(_account, SafeMath.sub(
                _startValue,
                _endValue
            ));
        }
    }
}