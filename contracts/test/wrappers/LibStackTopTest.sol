// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibStackTop.sol";

/// @title LibStackTopTest
/// Thin wrapper around `LibStackTop` library exposing functions for testing
contract LibStackTopTest {
    using LibStackTop for bytes;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;

    function peekUp(bytes memory bytes_) external pure returns (uint256 a_) {
        a_ = LibStackTop.peekUp(bytes_.asStackTop());
    }

    function peekUp(bytes memory bytes_, uint256 n_)
        external
        pure
        returns (uint256 a_)
    {
        a_ = LibStackTop.peekUp(bytes_.asStackTop().upBytes(n_));
    }

    function peekUp(uint256[] memory array_)
        external
        pure
        returns (uint256 a_)
    {
        a_ = LibStackTop.peekUp(array_.asStackTop());
    }

    function peekUp(uint256[] memory array_, uint256 n_)
        external
        pure
        returns (uint256 a_)
    {
        a_ = LibStackTop.peekUp(array_.asStackTop().up(n_));
    }
}
