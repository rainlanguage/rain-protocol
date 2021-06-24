// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./ReadWriteTier.sol";

contract TVKTransferTier is ReadWriteTier {
    using SafeERC20 for IERC20;

    /// Hardcoded as a constant to make auditing easier and lower storage requirements a bit.
    IERC20 public constant TVK = IERC20(
        0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988
    );

    /// Everyone who has NEVER interacted with the contract.
    uint256 public constant ZERO = uint256(0);
    /// Nothing, this is anyone who interacted with the contract.
    uint256 public constant ONE = uint256(0);
    /// 1000 TVK
    uint256 public constant TWO = uint256(10 ** (18+3));
    /// 5000 TVK
    uint256 public constant THREE = uint256(5*10 ** (18+3));
    /// 10 000 TVK
    uint256 public constant FOUR = uint256(10 ** (18+4));
    /// 25 000 TVK
    uint256 public constant FIVE = uint256(25*10 ** (18+3));
    /// 100 000 TVK
    uint256 public constant SIX = uint256(10 ** (18+5));
    /// 250 000 TVK
    uint256 public constant SEVEN = uint256(25*10 ** (18+4));
    /// 1 000 000 TVK
    uint256 public constant EIGHT = uint256(10 ** (18+6));

    /// Implements `_afterSetTier` from `ReadWriteTier`.
    ///
    /// Transfers TVK from the owner on increased tier.
    /// Transfers TVK to the owner on decreased tier.
    function _afterSetTier(
        address _account,
        ITier.Tier _oldTier,
        ITier.Tier _newTier,
        bytes memory
    )
        internal
        override
    {
        // Handle the TVK transfer.
        // Convert the current tier to a TVK amount.
        uint256 _oldTvk = levels()[uint(_oldTier)];
        // Convert the new tier to a TVK amount.
        uint256 _newTvk = levels()[uint(_newTier)];

        if (_newTvk >= _oldTvk) {
            // Going up, take ownership of TVK.
            TVK.safeTransferFrom(_account, address(this), SafeMath.sub(
                _newTvk,
                _oldTvk
            ));
        } else {
            // Going down, process a refund.
            TVK.safeTransfer(_account, SafeMath.sub(
                _oldTvk,
                _newTvk
            ));
        }
    }


    /// Return existing levels
    /// @return uint256 array of all existing levels
    function levels() public pure returns (uint256[9] memory) {
        return [ZERO, ONE, TWO, THREE, FOUR, FIVE, SIX, SEVEN, EIGHT];
    }
}