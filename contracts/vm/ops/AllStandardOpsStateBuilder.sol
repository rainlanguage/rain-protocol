// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../VMStateBuilder.sol";
import "./AllStandardOps.sol";

contract AllStandardOpsStateBuilder is VMStateBuilder {
    /// @inheritdoc VMStateBuilder
    function stackPops() public view override returns (uint256[] memory) {
        return AllStandardOps.stackPops(new uint256[](0));
    }

    /// @inheritdoc VMStateBuilder
    function stackPushes() public view override returns (uint256[] memory) {
        return AllStandardOps.stackPushes(new uint256[](0));
    }
}
