// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./TrustToken.sol";

contract BToken is TrustToken {
    constructor() public TrustToken(10 ** (18 + 7), "Token B", "TKNB") {}
}
