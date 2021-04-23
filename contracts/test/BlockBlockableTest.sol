// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "../libraries/BlockBlockable.sol";

contract BlockBlockableTest is BlockBlockable {
    constructor() public {}


    function unblockable() public view {}


    function whileBlocked() public view onlyBlocked {}


    function blockable() public view onlyUnblocked {}


    function trySetUnblockBlock(uint256 _unblock_block) public {
        BlockBlockable.setUnblockBlock(_unblock_block);
    }


    // Do nothing just to bump a new block.
    function noop() public {

    }
}
