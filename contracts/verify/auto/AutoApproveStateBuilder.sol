// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../../vm/StandardStateBuilder.sol";
import "./AutoApprove.sol";

contract AutoApproveStateBuilder is StandardStateBuilder {
    using LibFnPtrs for bytes;

    /// @inheritdoc StandardStateBuilder
    function localStackPops()
        internal
        pure
        virtual
        override
        returns (uint256[] memory)
    {
        uint256[] memory pops_ = new uint256[](1);
        // approved evidence
        pops_[0] = 1;
        return pops_;
    }

    /// @inheritdoc StandardStateBuilder
    function localStackPushes()
        internal
        pure
        virtual
        override
        returns (uint256[] memory)
    {
        uint256[] memory pushes_ = new uint256[](1);
        // approved evidence
        pushes_[0] = 1;
        return pushes_;
    }
}
