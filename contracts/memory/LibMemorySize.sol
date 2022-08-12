// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title LibMemorySize
/// @notice Reports the size in bytes of type data that represents contigious
/// regions of memory. Pointers to regions of memory that may not be congigious
/// are not supported, e.g. fields on structs may point to dynamic data that is
/// separate to the struct. Length slots for dynamic data are included in the
/// size and the size is always measured in bytes.
library LibMemorySize {
    using LibMemorySize for bytes;

    /// Reports the size of a `uint256` in bytes. Is always 32.
    /// @return 32.
    function size(uint256) internal pure returns (uint256) {
        return 0x20;
    }

    /// Reports the size of a `uint256[]` in bytes. Is the size of the length
    /// slot (32 bytes) plus the length of the array multiplied by 32 bytes per
    /// item.
    /// @return The size of the array data including its length slot size.
    function size(uint256[] memory array_) internal pure returns (uint256) {
        unchecked {
            return 0x20 + (array_.length * 0x20);
        }
    }

    /// Reports the size of `bytes` data. Is the size of the length slot
    /// (32 bytes) plus the number of bytes as per its length.
    /// @return The size of the `bytes` data including its length slot size.
    function size(bytes memory bytes_) internal pure returns (uint256) {
        unchecked {
            return 0x20 + bytes_.length;
        }
    }

    /// Reports the size of a `bytes[]` in bytes. Is the size of the length
    /// slot (32 bytes) plus the length slot of each item (32 bytes each)
    /// plus the bytes length of each item.
    /// @return size_ The size of the `bytes[]` data including its length slot
    /// size.
    function size(bytes[] memory bytesArray_)
        internal
        pure
        returns (uint256 size_)
    {
        unchecked {
            size_ = 0x20;
            for (uint256 i_ = 0; i_ < bytesArray_.length; i_++) {
                size_ += bytesArray_[i_].size();
            }
        }
    }
}
