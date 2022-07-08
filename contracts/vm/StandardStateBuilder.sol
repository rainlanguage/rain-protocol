// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./RainVM.sol";
import "./VMStateBuilder.sol";
import "./ops/AllStandardOps.sol";

contract StandardStateBuilder is VMStateBuilder {
    function localStackPops()
        internal
        pure
        virtual
        returns (uint256[] memory pops_)
    {}

    function localStackPushes()
        internal
        pure
        virtual
        returns (uint256[] memory pushes_)
    {}

    /// @inheritdoc VMStateBuilder
    function stackPops() public pure override returns (uint256[] memory pops_) {
        pops_ = AllStandardOps.stackPops(localStackPops());
    }

    /// @inheritdoc VMStateBuilder
    function stackPushes()
        public
        pure
        override
        returns (uint256[] memory pushes_)
    {
        pushes_ = AllStandardOps.stackPushes(localStackPushes());
    }
}
