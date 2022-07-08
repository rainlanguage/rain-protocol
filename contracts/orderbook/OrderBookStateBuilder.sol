// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/StandardStateBuilder.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";

contract OrderBookStateBuilder is StandardStateBuilder {
    using LibFnPtrs for bytes;

    function localStackPopsFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory fnPtrs_)
    {
        function(uint256) view returns (uint256)[3] memory fns_ = [
            LibFnPtrs.toStackMoveFn(2 * 0x20),
            // order funds cleared
            AllStandardOps.one,
            // order counterparty funds cleared
            AllStandardOps.two
        ];
        assembly {
            fnPtrs_ := fns_
        }
    }

    function localStackPushes()
        internal
        pure
        virtual
        override
        returns (uint[] memory )
    {
        uint[] memory pushes_ = new uint[](LOCAL_OPS_LENGTH);
        // order funds cleared
        pushes_[0] = 1;
        // order counterparty funds cleared
        pushes_[1] = 1;
        return pushes_;
    }
}
