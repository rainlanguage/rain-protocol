// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../bytes/LibBytes.sol";
import "../../../vm/runtime/LibStackTop.sol";
import "../../../debug/LibDebug.sol";

/// @title LibBytesTest
/// Thin wrapper around `LibBytes` library exposing methods for testing
contract LibBytesTest {
    using LibBytes for uint256;
    using LibStackTop for bytes;
    using LibStackTop for StackTop;

    function unsafeCopyBytesTo(bytes memory bytes0_, bytes memory bytes1_)
        external
        returns (StackTop)
    {
        LibDebug.dumpMemory();
        LibBytes.unsafeCopyBytesTo(
            StackTop.unwrap(bytes1_.asStackTop().up()),
            StackTop.unwrap(bytes0_.asStackTop()),
            bytes1_.length
        );
        LibDebug.dumpMemory();
        return bytes0_.asStackTop().upBytes(bytes1_.length);
    }
}
