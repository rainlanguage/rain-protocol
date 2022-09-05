// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../idempotent/LibIdempotentFlag.sol";

/// @title LibIdempotentFlagTest
/// Thin wrapper around `LibIdempotentFlag` library exposing methods for testing
contract LibIdempotentFlagTest {
    function get(IdempotentFlag flag_, uint256 index_)
        external
        pure
        returns (bool)
    {
        return LibIdempotentFlag.get(flag_, index_);
    }

    function set(IdempotentFlag flag_, uint256 index_)
        external
        pure
        returns (uint256)
    {
        return IdempotentFlag.unwrap(LibIdempotentFlag.set(flag_, index_));
    }
}
