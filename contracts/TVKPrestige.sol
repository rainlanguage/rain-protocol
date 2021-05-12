// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Prestige.sol";

contract TVKPrestige is Prestige {
    using SafeERC20 for IERC20;

    // Hardcoded as a constant to make auditing easier and lower storage requirements a bit.
    IERC20 public constant TVK = IERC20(
        0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988
    );

    // Everyone who has NEVER interacted with the contract.
    uint256 public constant NIL = uint256(0);
    // Nothing, this is anyone who interacted with the contract.
    uint256 public constant COPPER = uint256(0);
    // 1000 TVK
    uint256 public constant BRONZE = uint256(10 ** (18+3));
    // 5000 TVK
    uint256 public constant SILVER = uint256(5*10 ** (18+3));
    // 10 000 TVK
    uint256 public constant GOLD = uint256(10 ** (18+4));
    // 25 000 TVK
    uint256 public constant PLATINUM = uint256(25*10 ** (18+3));
    // 100 000 TVK
    uint256 public constant DIAMOND = uint256(10 ** (18+5));
    // 250 000 TVK
    uint256 public constant CHAD = uint256(25*10 ** (18+4));
    // 1 000 000 TVK
    uint256 public constant JAWAD = uint256(10 ** (18+6));



    /// Updates the level of an account by an entered level
    /// @param account the account to change the status.
    /// @param newStatus the new status to be changed.
    function _afterSetStatus(
        address account,
        Status oldStatus,
        Status newStatus,
        bytes memory
    )
        internal
        override
    {
        // Handle the TVK transfer.
        // Convert the current status to a TVK amount.
        uint256 _oldTvk = levels()[uint(oldStatus)];
        // Convert the new status to a TVK amount.
        uint256 _newTvk = levels()[uint(newStatus)];

        if (_newTvk >= _oldTvk) {
            // Going up, take ownership of TVK.
            TVK.safeTransferFrom(account, address(this), SafeMath.sub(
                _newTvk,
                _oldTvk
            ));
        } else {
            // Going down, process a refund.
            TVK.safeTransfer(account, SafeMath.sub(
                _oldTvk,
                _newTvk
            ));
        }
    }


    /// Return existing levels
    /// @return uint256 array of all existing levels
    function levels() public pure returns (uint256[9] memory) {
        return [NIL, COPPER, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, CHAD, JAWAD];
    }
}