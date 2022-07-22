// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../array/LibUint256Array.sol";

/// @title LibUint256ArrayTest
/// Thin wrapper around `LibUint256Array` library exposing methods for testing
contract LibUint256ArrayTest {
    using LibUint256Array for uint256[];

    function truncate(uint256[] memory array_, uint256 newLength_)
        external
        pure
        returns (uint256[] memory)
    {
        array_.truncate(newLength_);
        return array_;
    }

    function extend(uint256[] memory base_, uint256[] memory extend_)
        external
        pure
        returns (uint256[] memory)
    {
        base_.extend(extend_);
        return base_;
    }
}
