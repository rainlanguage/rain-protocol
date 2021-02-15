// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./TrustToken.sol";

contract AToken is TrustToken {
    constructor() public TrustToken(10 ** (18 + 6), "Token A", "TKNA") {}
}
