// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./RainVM.sol";
import "./VMStateBuilder.sol";
import "./ops/AllStandardOps.sol";

contract StandardStateBuilder is VMStateBuilder {
    function localStackPopsFnPtrs()
        internal
        pure
        virtual
        returns (bytes memory localStackPopsFnPtrs_)
    {}

    function localStackPushes()
        internal
        pure
        virtual
        returns (uint[] memory pushes_)
    {}

    /// @inheritdoc VMStateBuilder
    function stackPopsFnPtrs() public pure override returns (bytes memory) {
        return
            bytes.concat(
                AllStandardOps.stackPopsFnPtrs(),
                localStackPopsFnPtrs()
            );
    }

    /// @inheritdoc VMStateBuilder
    function stackPushes() public view override returns (uint[] memory pushes_) {
        pushes_ =
                AllStandardOps.stackPushes(localStackPushes());
    }
}
