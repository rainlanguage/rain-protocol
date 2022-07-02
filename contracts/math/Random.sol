// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../sstore2/SSTORE2.sol";

library Random {
    /// Implements a modified fisher yates algorithm to report a single result
    /// of a shuffle at position `n_` out of `max_`.
    ///
    /// Modifications:
    /// - We leave the initial allocation of the array as 0 values and use the
    ///   index of the internal shuffle iterations as the values to write. This
    ///   avoids an additional initial O(n) operation to prepopulate the array,
    ///   it also means we only support sequential arrays from [0,max].
    /// - We don't read or write the values that we draw from the side of the
    ///   swap that can't possibly be subsequently written to `n_`.
    /// - We stop processing the shuffle as soon as we know the value for `n_`.
    ///
    /// Each index is represented as a single byte so the micro lottery values
    /// cannot exceed `type(uint8).max`.
    ///
    /// Gas cost is `~230 * (max_ - n_)` so it is `O(n)` but lower ID values
    /// will pay more gas due to the lazy calculation of higher IDs. Worst case
    /// gas cost for the largest possible micro lottery and ID 0 is therefore
    /// about ~60 000 gas. Note however that memory expansion costs in the evm
    /// are non-linear past ~720 bytes, so if a function call is shuffling
    /// AND using other memory, it may incur substantial costs above the base
    /// cost due to the allocation of bytes needed to calculate the shuffle.
    /// The shuffle algorithm needs to allocate 1 byte for each ID + 32 bytes
    /// for the length slot of the bytes array.
    ///
    /// A possible NFT minting workflow for the microLottery:
    /// - Users reserve a sequential ID for themselves
    /// - A seed is generated somehow
    /// - Users mint an NFT for themselves where the NFT ID is the output of
    ///   their reserved ID as `n_` and everyone uses the same seed
    ///
    /// Using the above workflow, users pay the gas cost for their own ID
    /// shuffling, which is potentially more decentralised than a single user
    /// being responsible for shuffling. OTOH the total gas cost across all
    /// users is likely much higher than a single shuffle because every user
    /// must calculate _their_ shuffle, which includes all higher ID shuffles.
    /// This is simply how fisher yates works, and seems unavoidable without
    /// finding a different shuffle algorithm.
    ///
    /// One benefit of the micro lottery approach is that it can be exposed by
    /// the implementing contract as a "preview" public function, where it can
    /// be called offchain to inspect any ID for any seed without paying gas.
    function microLottery(
        uint256 seed_,
        uint256 max_,
        uint256 n_
    ) internal pure returns (uint256 item_) {
        unchecked {
            require(n_ < max_, "MAX_N");
            require(max_ <= type(uint8).max, "MAX_MAX");
            bytes memory array_ = new bytes(max_);
            assembly {
                // Select a random index [0, j_] using the hash of the
                // current value in scratch memory as source of randomness.
                function randomIndex(j_) -> v_ {
                    // roll the dice by hashing the scratch.
                    let roll_ := keccak256(0, 0x20)
                    // store the roll in scratch so it seeds the next roll.
                    mstore(0, roll_)
                    // mod will return every multiple of j_ as 0 so if we want
                    // the range of possible values to include both 0 and j_ we
                    // need to mod on j + 1.
                    v_ := mod(roll_, add(j_, 1))
                }

                // Read the item relative to the array pointer `ptr` at
                // index `j_`.
                function readItemAtIndex(ptr_, j_) -> v_ {
                    v_ := byte(31, mload(add(ptr_, j_)))
                    // we never call this function in a context where v_ being
                    // zero implies that zero was previously written at j_.
                    // j_ MAY also be zero in which case setting v_ will be a
                    // noop.
                    if iszero(v_) {
                        v_ := j_
                    }
                }

                // put the seed in scratch to initialize randomIndex.
                mstore(0, seed_)
                // We use mstore8 to write so a write index of 0 is exactly the
                // end of the length slot of the array.
                let writeStart_ := add(array_, 0x20)
                // We have to use mload (32 bytes) to read 1 byte by & 0xFF so
                // a read index of 0 needs to push the mload one byte to the
                // right of the length slot of the array.
                let readStart_ := add(array_, 1)

                // Write randomly to the array for all values above the target.
                // This won't run if n_ == max - 1.
                for {
                    let i_ := sub(max_, 1)
                } gt(i_, n_) {
                    i_ := sub(i_, 1)
                } {
                    mstore8(
                        add(writeStart_, randomIndex(i_)),
                        readItemAtIndex(readStart_, i_)
                    )
                }

                // Read randomly at the target.
                item_ := readItemAtIndex(readStart_, randomIndex(n_))
            }
        }
    }

    function shuffle(uint256 seed_, uint256 len_)
        internal
        pure
        returns (bytes memory shuffled_)
    {
        unchecked {
            shuffled_ = new bytes(len_ * 2);
            assembly {
                mstore(0, seed_)

                let ptr_ := add(shuffled_, 2)
                let
                    holeMask_
                := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000
                let vMask_ := 0xFFFF

                for {
                    let i_ := sub(len_, 1)
                } gt(i_, 0) {
                    // itself, which is whatever was written to it or 0. // Don't need to shuffle index 0 because it will always be
                    i_ := sub(i_, 1)
                } {
                    let location_ := add(ptr_, mul(i_, 2))
                    let base_ := mload(location_)
                    let v_ := and(base_, vMask_)
                    if iszero(v_) {
                        v_ := i_
                    }

                    let roll_ := keccak256(0, 0x20)
                    mstore(0, roll_)
                    let randomIndex_ := mod(roll_, add(i_, 1))

                    let randomLocation_ := add(ptr_, mul(randomIndex_, 2))
                    let randomBase_ := mload(randomLocation_)
                    let randomV_ := and(randomBase_, vMask_)
                    if iszero(randomV_) {
                        randomV_ := randomIndex_
                    }

                    mstore(location_, or(and(base_, holeMask_), randomV_))
                    mstore(randomLocation_, or(and(randomBase_, holeMask_), v_))
                }
            }
        }
    }

    function shuffleIdAtIndex(address ptr_, uint256 index_)
        internal
        view
        returns (uint256 id_)
    {
        unchecked {
            uint256 offset_ = index_ * 2;
            bytes memory idBytes_ = SSTORE2.read(ptr_, offset_, offset_ + 2);
            assembly {
                id_ := and(mload(add(idBytes_, 2)), 0xFFFF)
            }
        }
    }

    function randomId(uint256 seed_, uint256 index_)
        internal
        pure
        returns (uint256 id_)
    {
        assembly {
            mstore(0, seed_)
            mstore(0x20, index_)
            id_ := keccak256(0, 0x40)
        }
    }
}
