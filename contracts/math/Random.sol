// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

library Random {
    /// Implements a modified fisher yates algorithm to report a single result
    /// of a shuffle at position `n_` out of `max_`.
    function microLottery(uint256 seed_, uint256 max_, uint n_)
        internal
        pure
        returns(uint item_)
    {
        unchecked {
            require(n_ < max_, "MAX_N");
            bytes memory array_ = new bytes(max_);
            assembly {
                // put the seed in scratch to initialize randomIndex
                mstore(0, seed_)
                // We use mstore8 to write so a write index of 0 is exactly the
                // end of the length slot of the array.
                let arrayWriteStart_ := add(array_, 0x20)
                // We have to use mload (32 bytes) to read 1 byte by & 0xFF so
                // a read index of 0 needs to push the mload one byte to the
                // right of the length slot of the array.
                let arrayReadStart_ := add(array_, 1)
                function randomOffset(j_) -> v_ {
                    // roll the dice by hashing the scratch
                    let roll_ := keccak256(0, 0x20)
                    // store the roll in scratch so it seeds the next roll
                    mstore(0, roll_)
                    v_ := mod(roll_, j_)
                }
                function readItem(ptr_, j_) -> v_ {
                    v_ := and(mload(add(ptr_, j_)), 0xFF)
                    if iszero(v_) {
                        v_ := j_
                    }
                }
                // Write randomly to the array for all values above the target.
                // This won't run if n_ == max - 1
                for { let i_ := sub(max_, 1) } gt(i_, n_) { i_ := sub(i_, 1) }
                {
                    mstore8(
                        add(arrayWriteStart_, randomOffset(i_)),
                        readItem(arrayReadStart_, i_)
                    )
                }
                // Read randomly at the target.
                item_ := readItem(arrayReadStart_, randomOffset(n_))
            }
        }
    }
}
