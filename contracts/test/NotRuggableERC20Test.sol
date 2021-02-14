// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "../libraries/NotRuggableERC20.sol";

contract NotRuggableERC20Test is NotRuggableERC20 {
    constructor (string memory _name, string memory _symbol) public NotRuggableERC20(_name, _symbol) { }

    // This should only be possible once due to not being ruggable.
    function mintSome() public {
        _mint(msg.sender, 10 ** 18);
    }

}
