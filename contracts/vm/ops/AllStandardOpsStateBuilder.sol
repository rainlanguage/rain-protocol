// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../VMStateBuilder.sol";
import "./AllStandardOps.sol";

contract AllStandardOpsStateBuilder is VMStateBuilder {
    /// @inheritdoc VMStateBuilder
    function stackPopsFnPtrs() public pure override returns (uint256[] memory) {
        return AllStandardOps.stackPopsFnPtrs();
    }

    /// @inheritdoc VMStateBuilder
    function stackPushesFnPtrs()
        public
        pure
        override
        returns (uint256[] memory)
    {
        return AllStandardOps.stackPushesFnPtrs();
    }
}
