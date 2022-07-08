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
            function(uint256) view returns (uint256)[LOCAL_OPS_LENGTH + 1]
                memory fns_ = [
                    LibFnPtrs.toStackMoveFn(LOCAL_OPS_LENGTH * 0x20),
                    // approved evidence
                    AllStandardOps.one
                ];
            assembly {
                fnPtrs_ := fns_
            }
        }
    }

    function localStackPushes()
        internal
        pure
        virtual
        override
        returns (uint[] memory)
    {
        uint[] memory pushes_ = new uint[](1);
        // approved evidence
        pushes_[0] = 1;
        return pushes_;
    }
}
