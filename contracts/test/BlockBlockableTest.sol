// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../libraries/BlockBlockable.sol";

contract BlockBlockableTest is BlockBlockable {
    // solhint-disable-next-line no-empty-blocks
    constructor() public {}

    // solhint-disable-next-line no-empty-blocks
    function unblockable() public view {}

    // solhint-disable-next-line no-empty-blocks
    function whileBlocked() public view onlyBlocked { }

    // solhint-disable-next-line no-empty-blocks
    function blockable() public view onlyUnblocked { }

    function trySetUnblockBlock(uint256 _unblockBlock) public {
        BlockBlockable.setUnblockBlock(_unblockBlock);
    }


    // Do nothing just to bump a new block.
    // solhint-disable-next-line no-empty-blocks
    function noop() public {}
}
