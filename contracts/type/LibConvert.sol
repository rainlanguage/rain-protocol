// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title LibConvert
/// @notice Type conversions that require additional structural changes to
/// complete safely. These are NOT mere type casts and involve additional
/// reads and writes to complete, such as recalculating the length of an array.
/// The convention "toX" is adopted from Rust to imply the additional costs and
/// consumption of the source to produce the target.
library LibConvert {
    /// Convert an array of integers to `bytes` data. This requires modifying
    /// the length in situ as the integer array length is measured in 32 byte
    /// increments while the length of `bytes` is the literal number of bytes.
    /// @return bytes_ The integer array converted to `bytes` data.
    function toBytes(uint256[] memory is_)
        internal
        pure
        returns (bytes memory bytes_)
    {
        assembly ("memory-safe") {
            bytes_ := is_
            // Length in bytes is 32x the length in uint256
            mstore(bytes_, mul(0x20, mload(bytes_)))
        }
    }

    function unsafeTo16BitBytes(uint256[] memory is_)
        internal
        pure
        returns (bytes memory)
    {
        unchecked {
            // We will keep 2 bytes (16 bits) from each integer.
            bytes memory bytes_ = new bytes(is_.length * 2);
            assembly ("memory-safe") {
                let replaceMask_ := 0xFFFF
                let preserveMask_ := not(replaceMask_)
                for {
                    let cursor_ := add(is_, 0x20)
                    let end_ := add(cursor_, mul(mload(is_), 0x20))
                    let bytesCursor_ := add(bytes_, 0x02)
                } lt(cursor_, end_) {
                    cursor_ := add(cursor_, 0x20)
                    bytesCursor_ := add(bytesCursor_, 0x02)
                } {
                    let data_ := mload(bytesCursor_)
                    mstore(
                        bytesCursor_,
                        or(and(preserveMask_, data_), mload(cursor_))
                    )
                }
            }
            return bytes_;
        }
    }
}
