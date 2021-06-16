// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../libraries/Initable.sol";

contract InitableTest is Initable {
    // solhint-disable-next-line no-empty-blocks
    constructor() public {}

    // solhint-disable-next-line no-empty-blocks
    function init() external withInit {}

    // solhint-disable-next-line no-empty-blocks
    function beforeInit() external view onlyNotInit {}

    // solhint-disable-next-line no-empty-blocks
    function afterInit() external view onlyInit {}

    // solhint-disable-next-line no-empty-blocks
    function whenever() external view {}
}
