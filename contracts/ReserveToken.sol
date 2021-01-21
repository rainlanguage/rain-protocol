// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./AnyToken.sol";

contract ReserveToken is AnyToken {
    constructor() public AnyToken(500000, "Reserve Token", "RES") {}
}
