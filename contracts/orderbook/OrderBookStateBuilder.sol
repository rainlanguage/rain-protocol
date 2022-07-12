// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/StandardStateBuilder.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";

contract OrderBookStateBuilder is StandardStateBuilder {
    using LibFnPtrs for bytes;

    /// @inheritdoc StandardStateBuilder
    function localStackPops()
        internal
        pure
        virtual
        override
        returns (uint256[] memory)
    {
        uint256[] memory pops_ = new uint256[](LOCAL_OPS_LENGTH);
        // order funds cleared
        pops_[0] = 1;
        // order counterparty funds cleared
        pops_[1] = 2;
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
        uint256[] memory pushes_ = new uint256[](LOCAL_OPS_LENGTH);
        // order funds cleared
        pushes_[0] = 1;
        // order counterparty funds cleared
        pushes_[1] = 1;
        return pushes_;
    }
}
