// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "../libraries/Initable.sol";

contract InitableTest is Initable {
    constructor() public {}

    function init() public withInit {}

    function beforeInit() public view onlyNotInit {}

    function afterInit() public view onlyInit {}

    function whenever() public view {}
}
