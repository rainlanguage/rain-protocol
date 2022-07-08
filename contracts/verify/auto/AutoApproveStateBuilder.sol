// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../../vm/StandardStateBuilder.sol";
import "./AutoApprove.sol";

contract AutoApproveStateBuilder is StandardStateBuilder {
    using LibFnPtrs for bytes;

    function localStackPopsFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory fnPtrs_)
    {
        unchecked {
            fnPtrs_ = new bytes(LOCAL_OPS_LENGTH * 0x20);
            function(uint256) pure returns (uint256)[LOCAL_OPS_LENGTH]
                memory fns_ = [
                    // approved evidence
                    AllStandardOps.one
                ];
            for (uint256 i_ = 0; i_ < LOCAL_OPS_LENGTH; i_++) {
                fnPtrs_.unsafeInsertStackMovePtr(i_, fns_[i_]);
            }
        }
    }

    function localStackPushesFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory fnPtrs_)
    {
        unchecked {
            fnPtrs_ = new bytes(LOCAL_OPS_LENGTH * 0x20);
            function(uint256) pure returns (uint256)[LOCAL_OPS_LENGTH]
                memory fns_ = [
                    // approved evidence
                    AllStandardOps.one
                ];
            for (uint256 i_ = 0; i_ < LOCAL_OPS_LENGTH; i_++) {
                fnPtrs_.unsafeInsertStackMovePtr(i_, fns_[i_]);
            }
        }
    }
}
