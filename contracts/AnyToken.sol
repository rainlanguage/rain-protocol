// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AnyToken is ERC20 {
    constructor(uint256 initialSupply, string memory name, string memory symbol) public ERC20(name, symbol) {
        // No decimals for our tokens.
        _setupDecimals(1);
        _mint(msg.sender, initialSupply);
    }
}
