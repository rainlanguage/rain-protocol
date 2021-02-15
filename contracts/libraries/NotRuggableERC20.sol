// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { console } from "hardhat/console.sol";

// A NotRuggable will revert any attempt to _mint an Open Zeppelin ERC20 after the first.
//
// Specifically the _beforeTokenTransfer will revert any transaction if:
//
// - The source is the `0` address (indicating a mint)
// - The current total supply is non-zero
//
// This is only a safety net in the case of some kind of logical error.
abstract contract NotRuggableERC20 is ERC20 {
    constructor (string memory _name, string memory _symbol) public ERC20(_name, _symbol) { }

    function _beforeTokenTransfer(address _sender, address, uint256) internal override {
        // `_mint` in Open Zeppelin ERC20 is always from the 0 address.
        // Open Zeppelin already reverts any other transfer from the 0 address.
        // We do need to allow minting when the supply is 0.
        require(_sender != address(0) || ERC20(this).totalSupply() == 0, "ERR_RUG_PULL");
    }
}