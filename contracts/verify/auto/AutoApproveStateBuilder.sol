// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../../vm/StandardStateBuilder.sol";
import "./AutoApprove.sol";
import "../../type/LibCast.sol";

contract AutoApproveStateBuilder is StandardStateBuilder {
    using LibCast for function(uint256) pure returns (uint256)[];

    /// @inheritdoc StandardStateBuilder
    function localStackPops()
        internal
        pure
        virtual
        override
        returns (uint256[] memory)
    {
        function(uint256) pure returns (uint256)[] memory pops_ = new function(
            uint256
        ) pure returns (uint256)[](1);
        // approved evidence
        pops_[0] = AllStandardOps.one;
        return pops_.asUint256Array();
    }

    /// @inheritdoc StandardStateBuilder
    function localStackPushes()
        internal
        pure
        virtual
        override
        returns (uint256[] memory)
    {
        function(uint256) pure returns (uint256)[]
            memory pushes_ = new function(uint256) pure returns (uint256)[](1);
        // approved evidence
        pushes_[0] = AllStandardOps.one;
        return pushes_.asUint256Array();
    }
}
