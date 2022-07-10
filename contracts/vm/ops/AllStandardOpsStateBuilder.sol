// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../VMStateBuilder.sol";
import "./AllStandardOps.sol";

contract AllStandardOpsStateBuilder is VMStateBuilder {
    /// @inheritdoc VMStateBuilder
    function stackPops() public pure override returns (uint256[] memory) {
        return AllStandardOps.stackPops(new uint256[](0));
    }

    /// @inheritdoc VMStateBuilder
    function stackPushes() public pure override returns (uint256[] memory) {
        return AllStandardOps.stackPushes(new uint256[](0));
    }
}
