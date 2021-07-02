// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../libraries/BlockBlockable.sol";

contract BlockBlockableTest is BlockBlockable {
    // solhint-disable-next-line no-empty-blocks
    constructor() public {}

    // solhint-disable-next-line no-empty-blocks
    function unblockable() external view {}

    // solhint-disable-next-line no-empty-blocks
    function whileBlocked() external view onlyBlocked {}

    // solhint-disable-next-line no-empty-blocks
    function blockable() external view onlyUnblocked {}

    function trySetUnblockBlock(uint256 unblockBlock_) external {
        BlockBlockable.setUnblockBlock(unblockBlock_);
    }

    // Do nothing just to bump a new block.
    // solhint-disable-next-line no-empty-blocks
    function noop() external {}
}
