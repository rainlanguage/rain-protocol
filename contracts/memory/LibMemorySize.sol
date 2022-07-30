// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

library LibMemorySize {
    using LibMemorySize for bytes;

    function size(uint256) internal pure returns (uint256) {
        return 0x20;
    }

    function size(uint256[] memory array_) internal pure returns (uint256) {
        unchecked {
            return 0x20 + (array_.length * 0x20);
        }
    }

    function size(bytes memory bytes_) internal pure returns (uint256) {
        unchecked {
            return 0x20 + bytes_.length;
        }
    }

    function size(bytes[] memory bytess_)
        internal
        pure
        returns (uint256 size_)
    {
        unchecked {
            for (uint256 i_ = 0; i_ < bytess_.length; i_++) {
                size_ += bytess_[i_].size();
            }
        }
    }
}
