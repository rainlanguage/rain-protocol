// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../vm/StandardStateBuilder.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";
import "../type/LibCast.sol";

contract OrderBookStateBuilder is StandardStateBuilder {
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
        ) pure returns (uint256)[](LOCAL_OPS_LENGTH);
        // order funds cleared
        pops_[0] = AllStandardOps.one;
        // order counterparty funds cleared
        pops_[1] = AllStandardOps.two;
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
            memory pushes_ = new function(uint256) pure returns (uint256)[](
                LOCAL_OPS_LENGTH
            );
        // order funds cleared
        pushes_[0] = AllStandardOps.one;
        // order counterparty funds cleared
        pushes_[1] = AllStandardOps.two;
        return pushes_.asUint256Array();
    }
}
