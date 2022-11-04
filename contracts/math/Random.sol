// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../sstore2/SSTORE2.sol";

library Random {
    /// Implements a fisher yates algorithm to report a single result
    /// of a shuffle at position `n_` out of `max_`.
    ///
    /// Optimizations:
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
    /// One possible NFT minting workflow for the microLottery:
    /// - All metadata is revealed publicly before the onchain process
    /// - Users reserve a sequential ID for themselves
    /// - A seed is generated somehow, e.g. "rain dance"
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
    /// Note that lottery uses a simple `%` to select a random index from the
    /// 32 byte keccak output. This will introduce some "small" module bias,
    /// which is likely negligible in the context of e.g. assigning NFT metadata
    /// but could easily be enough bias to break cryptographic systems. DO NOT
    /// use lottery as a component in cryptographic systems.
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
            assembly ("memory-safe") {
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

    /// Implements a fisher yates algorithm to return a shuffled list of 2-byte
    /// sequential uint16s represented as raw bytes. Uses the same general
    /// approach as `microLottery` but always shuffles the entire list, rather
    /// than exiting at a specified ID. As the entire list is returned there is
    /// an extra write in the shuffle implementation vs. the microLottery that
    /// leads to a somewhat higher gas cost of ~260 per ID (vs. ~230). Assuming
    /// that negligible other memory has been allocated in the same function
    /// call, so that memory expansion costs are approximately linear, the
    /// per-ID gas cost is almost constant from 1-10k IDs.
    ///
    /// After the shuffle is complete the resulting bytes need to be stored
    /// for later lookups. Assuming SSTORE2 there will be ~55k fixed overhead
    /// to create the data contract and store a pointer to it, then 400 gas per
    /// id (200 per byte) to write the shuffled array.
    ///
    /// Total gas cost of shuffle + SSTORE2 ~= 55k + (660 * length)
    ///
    /// Absolute maximum size of a contract is 24576 bytes ~= 12k IDs which
    /// costs a little over 8 million gas to generate and deploy. At this point
    /// the shuffle is getting close to triggering network limits in several
    /// dimensions, so projects should plan accordingly.
    ///
    /// Once the shuffled array is stored as SSTORE2 it has a constant read cost
    /// O(1) for any ID and any total number of IDs. The gas cost will be ~2.1k
    /// for the storage read of the pointer to the data contract and ~3k to load
    /// the data contract and fetch the shuffled ID, total ~5k gas to read. If
    /// more than one shuffled ID is read in a single call then the gas cost of
    /// subsequent reads is significantly cheaper at ~750 gas per read, as the
    /// data contract is "warm" to read from.
    ///
    /// One possible NFT minting workflow for the shuffle:
    /// - All metadata is revealed publicly before the onchain process
    /// - Users reserve a sequential ID for themselves
    /// - A seed is generated somehow, e.g. "rain dance"
    /// - "Someone" (can be anyone willing to pay the gas) calls a function to
    /// build and store the shuffled bytes from the seed
    /// - Users mint an NFT for themselves where the NFT ID is the shuffled ID
    /// at the user's sequential ID as an index
    ///
    /// Using the above workflow a single entity must pay the gas cost to map
    /// every ID to a shuffled ID via a shared seed. As the mapping is
    /// deterministic given a seed and length there is no security concern
    /// leaving this mapping function world-callable. There is no obligation for
    /// the deployers of the NFT contract to be the entity that pays the gas,
    /// although it often will be socially expected of them.
    ///
    /// Note that shuffle uses a simple `%` to select a random index from the
    /// 32 byte keccak output. This will introduce some "small" module bias,
    /// which is likely negligible in the context of e.g. assigning NFT metadata
    /// but could easily be enough bias to break cryptographic systems. DO NOT
    /// use shuffle as a component in cryptographic systems.
    ///
    /// @param seed_ The seed that feeds into the deterministic shuffle output.
    /// @param len_ The number of items to shuffle, final output will be 2x the
    /// length in bytes as each item is uint16.
    /// @return shuffled_ The shuffled items as bytes in memory, length will be
    /// 2x `len_` as each item is 16 bits.
    function shuffle(
        uint256 seed_,
        uint256 len_
    ) internal pure returns (bytes memory shuffled_) {
        unchecked {
            // Allocate all the items up front as empty bytes.
            shuffled_ = new bytes(len_ * 2);
            assembly ("memory-safe") {
                // Initialize the seed in scratch space.
                // Needed for "random" rolls below.
                mstore(0, seed_)

                // Item 0 will be read 2-bytes past the length of `shuffled_`.
                // All offsets for items are relative to the pointer.
                let ptr_ := add(shuffled_, 2)
                // When we `mload` then `or` the new values with existing data
                // in memory from the bytes array we have to mask out the 2
                // bytes at the end of the loaded value.
                let
                    itemMask_
                := 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000

                // When we want to read ONLY the current item being considered
                // from a full 32 byte `mload` we want to keep only the last
                // 2 bytes.
                let valueMask_ := 0xFFFF

                // Start at the end of the bytes array and work down towards 0.
                // Don't need to shuffle index 0 because it will always be
                // itself, which is whatever was written to it or 0.
                // i_ is the index being shuffled which is converted to a
                // 2 byte offset as needed.
                for {
                    let i_ := sub(len_, 1)
                } gt(i_, 0) {
                    i_ := sub(i_, 1)
                } {
                    // Calculate the location, base and value for the current
                    // index being shuffled.
                    let location_ := add(ptr_, mul(i_, 2))
                    let base_ := mload(location_)
                    let value_ := and(base_, valueMask_)
                    if iszero(value_) {
                        value_ := i_
                    }

                    // Generate a "random" index by hashing the first value in
                    // current scratch space.
                    let roll_ := keccak256(0, 0x20)
                    mstore(0, roll_)
                    let randomIndex_ := mod(roll_, add(i_, 1))

                    // Calculate the location, base and value for the "random"
                    // index that the current index will be swapped with.
                    let randomLocation_ := add(ptr_, mul(randomIndex_, 2))
                    let randomBase_ := mload(randomLocation_)
                    let randomV_ := and(randomBase_, valueMask_)
                    if iszero(randomV_) {
                        randomV_ := randomIndex_
                    }

                    // Merge the value from the "random" index with the read
                    // from current index and save it back to the current
                    // index's location.
                    mstore(location_, or(and(base_, itemMask_), randomV_))
                    // Merge the value from the current index with the read from
                    // the "random" index and save it back to the "random"
                    // index's location.
                    mstore(
                        randomLocation_,
                        or(and(randomBase_, itemMask_), value_)
                    )
                }
            }
        }
    }

    /// Given a pointer to some shuffled bytes written by SSTORE2, read back the
    /// bytes and extract the shuffled ID for the sequential unshuffled index.
    /// @param ptr_ The address of the data contract deployed by SSTORE2.
    /// @param index_ Sequential index to read 2-byte ID from.
    /// @return id_ The shuffled ID associated with the passed index. Internally
    /// is only 2-bytes, i.e. uint16 but is returned as uint256 as e.g. NFT IDs
    /// etc. are typically uint256 values.
    function shuffleIdAtIndex(
        address ptr_,
        uint256 index_
    ) internal view returns (uint256 id_) {
        unchecked {
            uint256 offset_ = index_ * 2;
            bytes memory idBytes_ = SSTORE2.read(ptr_, offset_, offset_ + 2);
            assembly ("memory-safe") {
                id_ := and(mload(add(idBytes_, 2)), 0xFFFF)
            }
        }
    }

    /// Given a seed and an index, return a randomized ID value across the space
    /// of all possible uint256 values. The result is simply hashing the seed
    /// and index together, so it is cheap and simple at 105 gas flat per ID.
    /// The random mappings will NOT be the same as the shuffling for any ID.
    ///
    /// This approach trades off the ability to have fixed size rarity buckets
    /// of metadata for the ability to scale input IDs "infinitely" for a
    /// given seed. There are no upfront or non-constant costs beyond seed
    /// generation, no matter how many IDs (even millions) there are.
    ///
    /// The approach requires procedural generation of metadata, or at least
    /// enough headroom in rarity buckets that there will always be "enough" to
    /// cover probabalistic fluctuations in how many IDs are in each bucket.
    /// To ensure that the metadata is trustless, the procedure in which the
    /// metadata is generated MUST be public along with the metdata itself. This
    /// can be done offchain such as in a subgraph or through open source code
    /// to allow users to verify the generated metadata itself hasn't been
    /// tampered with.
    ///
    /// Rarity buckets can be simulated geometrically by calculating thresholds
    /// across [0, 2^256-1] that are positioned according to the
    /// desired probabilities of any ID falling in the bucket. For example, if
    /// bucket A is to be twice as likely as bucket B we need 2/3 of all IDs to
    /// be in A and 1/3 in bucket B. If we calculate 2/3 * (2^256 - 1) and treat
    /// every shuffled ID below this value as rarity A and every ID above as B
    /// then we expect it to distributed IDs in buckets exactly as a shuffled
    /// array with a 2/3 and 1/3 split of metadata.
    ///
    /// Keccak gives an extremely (cryptographic) uniform distribution of
    /// outputs across all possible inputs. Deviations from the actual number
    /// of IDs falling into buckets for any seed vs. what we desire/predict
    /// will be small and uncommon, with the precision increasing with larger
    /// sample sizes (more total IDs).
    /// This is similar to simulating/approximating without calculating directly
    /// using Monte Carlo methods, where increasing the number of uniformly
    /// distributed points improves the quality of the approximation:
    /// https://en.wikipedia.org/wiki/Monte_Carlo_method
    ///
    /// Note that if you try to create buckets with modulo `%` you will probably
    /// introduce potentially significant modulo bias that will need to be
    /// compensated for, e.g. re-rolling results in the biased range.
    ///
    /// Exactly as the shuffle/lottery systems, once the seed is known, all
    /// mappings of input indexes to output IDs are known, so ad-hoc/JIT hashing
    /// does nothing to solve this problem.
    ///
    /// @param seed_ The input seed that is used to map all indexes to the
    /// randomized output ids.
    /// @param index_ The index to calculate the output ID for.
    /// @param id_ The output ID corresponding to the input and seed, will be
    /// across the entire range [0, 2^256 - 1].
    function randomId(
        uint256 seed_,
        uint256 index_
    ) internal pure returns (uint256 id_) {
        assembly ("memory-safe") {
            mstore(0, seed_)
            mstore(0x20, index_)
            id_ := keccak256(0, 0x40)
        }
    }
}
