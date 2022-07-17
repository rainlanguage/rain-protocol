// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title LibConvert
/// @notice Type conversions that require additional structural changes to
/// complete safely. These are NOT mere type casts and involve additional
/// reads and writes to complete, such as recalculating the length of an array.
/// The convention "toX" is adopted from Rust to imply the additional costs and
/// consumption of the source to produce the target.
library LibConvert {
    function toBytes(uint256[] memory is_)
        internal
        pure
        returns (bytes memory bytes_)
    {
        assembly {
            bytes_ := is_
            // Length in bytes is 32x the length in uint256
            mstore(bytes_, mul(0x20, mload(bytes_)))
        }
    }
}
