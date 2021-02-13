// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import { console } from "hardhat/console.sol";

// A NotRuggable will revert any attempt to _mint an Open Zeppelin ERC20 after the first.
//
// Specifically the _beforeTokenTransfer will revert any transaction if:
//
// - The source is the `0` address (indicating a mint)
// - The current total supply is non-zero
//
// This is only a safety net in the case of some kind of logical error.
abstract contract NotRuggable {
    function _beforeTokenTransfer(address _sender, address _recipient, uint256 _amount) private view {
        // `_mint` in Open Zeppelin ERC20 is always from the 0 address.
        // Open Zeppelin already reverts any other transfer from the 0 address.
        // We do need to allow minting when the supply is 0.
        require(_sender != address(0) || this._totalSupply == 0, "ERR_RUG_PULL");
    }
}