// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

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

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(IntegrityState memory, uint256, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc VMStateBuilder
    function integrityFunctionPointers()
        internal
        view
        virtual
        override
        returns (function(IntegrityState memory, uint256, StackTop)
                view
                returns (StackTop)[]
                memory)
    {
        return
            AllStandardOps.integrityFunctionPointers(
                localIntegrityFunctionPointers()
            );
    }
}
