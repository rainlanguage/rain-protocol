// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import { console } from "hardhat/console.sol";

// A BlockBlockable contract can block modified functions until a specified block.
//
// The unblock block can only be set once.
//
// The contract starts in a blocked state and must be explicitly unblocked.
//
// ONLY functions modified with `onlyUnblocked` enforce blocking.
//
// If the unblock block is nonzero but doesn't exist in the blockchain the contract is blocked.
//
// 1. The contract starts _blocked_
// 2. `setUnblockBlock` is called to define a nonzero unblock block
// 3. The contract is _unblocked at or after_ the unblock block
abstract contract BlockBlockable {
    string constant private ERR_BLOCK_ONCE = "ERR_BLOCK_ONCE";
    string constant private ERR_BLOCK_ZERO = "ERR_BLOCK_ZERO";
    string constant private ERR_ONLY_BLOCKED = "ERR_ONLY_BLOCKED";
    string constant private ERR_ONLY_UNBLOCKED = "ERR_ONLY_UNBLOCKED";

    // The outside world is free to inspect the unblock block.
    // The contract is no longer blocked when this block exists.
    // The contract starts unblocked.
    uint256 public unblock_block = 0;

    // Modified function MUST ONLY be called when the unblock_block NOT exists.
    // Useful for functions that MAY prepare state before the unblocking that should not be allowed to modify state after the fact.
    modifier onlyBlocked() {
        console.log("BlockBlockable: onlyBlocked: %s %s", unblock_block, block.number);
        require(0 == unblock_block || block.number < unblock_block, ERR_ONLY_BLOCKED);
        _;
    }

    // Modified function MUST ONLY be called when the unblock_block exists.
    modifier onlyUnblocked() {
        console.log("BlockBlockable: onlyUnblocked: %s %s", unblock_block, block.number);
        // The initial state is blocked.
        require(0 < unblock_block, ERR_ONLY_UNBLOCKED);
        // The current block can be the unblocking block because it exists.
        require(block.number >= unblock_block, ERR_ONLY_UNBLOCKED);
        _;
    }

    // Set the block after which the contract is unblocked.
    function setUnblockBlock(uint256 _unblock_block) internal {
        console.log("BlockBlockable: setUnblockBlock: %s %s", unblock_block, _unblock_block);
        // The unblock block can only be set once.
        require(0 == unblock_block, ERR_BLOCK_ONCE);
        // Set the unblock block.
        unblock_block = _unblock_block;
        // The unblock block MUST be nonzero.
        require(0 < unblock_block, ERR_BLOCK_ZERO);
    }
}