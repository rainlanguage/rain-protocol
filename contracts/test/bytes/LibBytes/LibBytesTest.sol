// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../bytes/LibBytes.sol";
import "../../../interpreter/run/LibStackPointer.sol";
import "../../../debug/LibDebug.sol";

/// @title LibBytesTest
/// Thin wrapper around `LibBytes` library exposing methods for testing
contract LibBytesTest {
    using LibBytes for uint256;
    using LibStackPointer for bytes;
    using LibStackPointer for StackPointer;

    function unsafeCopyBytesTo(
        bytes memory bytes0_,
        bytes memory bytes1_
    ) external returns (StackPointer) {
        LibDebug.dumpMemory();
        LibBytes.unsafeCopyBytesTo(
            StackPointer.unwrap(bytes1_.asStackPointer().up()),
            StackPointer.unwrap(bytes0_.asStackPointer()),
            bytes1_.length
        );
        LibDebug.dumpMemory();
        return bytes0_.asStackPointer().upBytes(bytes1_.length);
    }
}
