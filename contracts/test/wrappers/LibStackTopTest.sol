// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibStackTop.sol";

/// @title LibStackTopTest
/// Thin wrapper around `LibStackTop` library exposing functions for testing
contract LibStackTopTest {
    using LibStackTop for bytes;
    using LibStackTop for StackTop;

    function peekUp(bytes memory bytes_) external pure returns (uint256 a_) {
        a_ = LibStackTop.peekUp(bytes_.asStackTop());
    }

    function peek(bytes memory bytes_) external pure returns (uint256 a_) {
        a_ = LibStackTop.peek(bytes_.asStackTop());
    }
}
