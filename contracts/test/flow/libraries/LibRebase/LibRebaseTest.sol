// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../flow/libraries/LibRebase.sol";

/// @title LibRebaseTest
/// Thin wrapper around `LibRebase` library exposing functions for testing
contract LibRebaseTest {
    function rebaseRatio(VMState memory state_, SourceIndex entrypoint_)
        external
        view
        returns (uint256)
    {
        return LibRebase.rebaseRatio(state_, entrypoint_);
    }

    function rebaseInput(uint256 input_, uint256 ratio_)
        external
        pure
        returns (uint256)
    {
        return LibRebase.rebaseInput(input_, ratio_);
    }

    function rebaseOutput(uint256 output_, uint256 ratio_)
        external
        pure
        returns (uint256)
    {
        return LibRebase.rebaseOutput(output_, ratio_);
    }
}
