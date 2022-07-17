// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title LibPackBytes
/// @notice When there is a gas cost associated with saving/expanding/sending
/// bytes across blocks/interfaces it MAY be beneficial to "pack" bytes inline.
/// This involves discarding bytes that we expect to always be 0 without
/// allocating new bytes in memory. For example we could treat every 32 bytes
/// as a uint256 and discard the first 30 bytes of each to produce the
/// equivalent of a list of uint16 in memory.
/// As the functions in this library do NOT allocate new memory they do NOT
/// return any values either, instead the argument is mutated directly.
/// Calling functions MUST ensure they safely handle the newly shortened and
/// mutated bytes.
/// This process is similar to `abi.encodePacked` but without new allocations.
library LibPackBytes {
    function pack32To2(bytes memory bytes_) internal pure {
        require(bytes_.length % 32 == 0, "BYTES_MOD_32");
        assembly ("memory-safe") {
            for {
                let inputCursor_ := add(bytes_, 32)
                let end_ := add(inputCursor_, mload(bytes_))
                let outputCursor_ := add(bytes_, 2)
            } lt(inputCursor_, end_) {
                inputCursor_ := add(inputCursor_, 32)
                outputCursor_ := add(outputCursor_, 2)
            } {
                // Get the 2 byte value to preserve in packed output.
                let v_ := and(mload(inputCursor_), 0xFFFF)
                // Zero the memory so it doesn't interfere with packed output.
                mstore(inputCursor_, 0)
                // Update the packed output.
                mstore(outputCursor_, or(mload(outputCursor_), v_))
            }
            // Set the length of the packed bytes to 1/16th the unpacked bytes.
            mstore(bytes_, div(mload(bytes_), 16))
        }
    }
}
