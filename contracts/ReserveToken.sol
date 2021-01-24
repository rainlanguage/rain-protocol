// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./AnyToken.sol";

contract ReserveToken is AnyToken {
    constructor() public AnyToken(10 ** (18 + 12), "Reserve Token", "RES") {}
}
