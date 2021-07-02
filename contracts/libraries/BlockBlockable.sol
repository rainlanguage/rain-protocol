// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/// @title BlockBlockable
/// A BlockBlockable contract can block modified functions until a specified block.
///
/// The unblock block can only be set once.
///
/// The contract starts in a blocked state and must be explicitly unblocked.
///
/// ONLY functions modified with `onlyUnblocked` enforce blocking.
///
/// If the unblock block is nonzero but doesn't exist in the blockchain the contract is blocked.
///
/// 1. The contract starts _blocked_
/// 2. `setUnblockBlock` is called to define a nonzero unblock block
/// 3. The contract is _unblocked at or after_ the unblock block
///
/// An `UnblockBlockSet` event is emmitted as `_unblockBlock` when the unblock block is _set_.
/// There is no event on unblock, the contract functions simply start/stop reverting.
abstract contract BlockBlockable {
    /// This event is emitted when the unblock block is set.
    /// This can only happen once.
    event UnblockBlockSet(uint256 unblockBlock);

    /// If this is set to a non-zero value this is the unblock block.
    /// The contract is unblocked after this block.
    uint256 public unblockBlock;

    /// Check if the the contract is currently unblocked.
    /// If the unblock block is not set then the contract is blocked.
    /// If the unblock block is set and now or in the past then the contract is unblocked.
    function isUnblocked() public view returns (bool) {
        return
            // Unblock block not set => blocked.
            ( 0 < unblockBlock ) &&
            // Unblock block is set and is now or in the past => unblocked.
            ( unblockBlock <= block.number );
    }


    /// Modified function can ONLY be called when the unblockBlock NOT exists.
    modifier onlyBlocked() {
        require(!isUnblocked(), "ONLY_BLOCKED");
        _;
    }


    /// Modified function can ONLY be called when the unblockBlock exists.
    modifier onlyUnblocked() {
        require(isUnblocked(), "ONLY_UNBLOCKED");
        _;
    }


    /// Set the block at which the contract is unblocked.
    /// This function has no access controls so use it with `onlyOwner` or similar.
    /// @param newUnblockBlock_ The unblock block being set. Must be at least the current block.
    function setUnblockBlock(uint256 newUnblockBlock_) internal {
        /// MUST NOT be a no-op.
        require(block.number <= newUnblockBlock_, "BLOCK_PAST");

        // unblockBlock can only be set once.
        require(unblockBlock < 1, "BLOCK_ONCE");

        // Set the unblock block.
        unblockBlock = newUnblockBlock_;

        emit UnblockBlockSet(newUnblockBlock_);
    }
}