// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../bytes/LibPackBytes.sol";

/// @title LibPackBytesTest
/// Thin wrapper around `LibPackBytes` library exposing methods for testing
contract LibPackBytesTest {
    using LibPackBytes for bytes;

    function pack32To2(bytes memory bytes_)
        external
        pure
        returns (bytes memory)
    {
        bytes_.pack32To2();
        return bytes_;
    }
}
