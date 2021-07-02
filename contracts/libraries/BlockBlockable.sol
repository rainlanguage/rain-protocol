// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

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
//
// An `UnblockBlockSet` event is emmitted as `_unblockBlock` when the unblock block is _set_.
// There is no event on unblock, the contract functions simply start/stop reverting.
abstract contract BlockBlockable {
    /// The UnblockBlock has been set.
    event UnblockBlockSet(uint256 unblockBlock);

    // The outside world is free to inspect the unblock block.
    // The contract is no longer blocked when this block exists.
    // The contract starts unblocked.
    uint256 public unblockBlock = 0;


    function isUnblocked() public view returns (bool) {
        return
            // Unblock block not set => blocked.
            ( 0 < unblockBlock ) &&
            // Unblock block is set and is now or in the past => unblocked.
            ( block.number >= unblockBlock );
    }


    // Modified function MUST ONLY be called when the unblockBlock NOT exists.
    // Useful for functions that MAY prepare state before the unblocking that should not be allowed to modify state after the fact.
    modifier onlyBlocked() {
        require(!isUnblocked(), "ONLY_BLOCKED");
        _;
    }


    // Modified function MUST ONLY be called when the unblockBlock exists.
    modifier onlyUnblocked() {
        require(isUnblocked(), "ONLY_UNBLOCKED");
        _;
    }


    // Set the block after which the contract is unblocked.
    // This function has no access controls so use it with `onlyOwner` or similar.
    function setUnblockBlock(uint256 newUnblockBlock_) internal {
        /// MUST NOT be a no-op.
        require(0 < newUnblockBlock_, "BLOCK_ZERO");

        // unblockBlock can only be set once.
        require(unblockBlock < 1, "BLOCK_ONCE");

        // Set the unblock block.
        unblockBlock = newUnblockBlock_;

        emit UnblockBlockSet(newUnblockBlock_);
    }
}