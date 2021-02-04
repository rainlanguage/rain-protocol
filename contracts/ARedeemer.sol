// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./AnyRedeemer.sol";

contract ARedeemer is AnyRedeemer {
    constructor() public AnyRedeemer(
        IERC20(address(0xFC628dd79137395F3C9744e33b1c5DE554D94882)),
        10 ** (18 + 4),
        IERC20(address(0xDb56f2e9369E0D7bD191099125a3f6C370F8ed15)),
        50
    ) {}
}
