// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./AnyToken.sol";

contract TKNA is AnyToken {
    constructor() public AnyToken(100000, "Token A", "TKNA") {}
}
