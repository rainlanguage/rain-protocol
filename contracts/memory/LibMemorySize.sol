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
}
