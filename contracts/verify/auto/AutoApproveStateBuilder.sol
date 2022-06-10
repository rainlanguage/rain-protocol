// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../../vm/StandardStateBuilder.sol";
import "./AutoApprove.sol";

contract AutoApproveStateBuilder is StandardStateBuilder {
    function localStackPopsFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory)
    {
        unchecked {
            uint256 lenBytes_ = LOCAL_OPS_LENGTH * 0x20;
            function(uint256) pure returns (uint256) zeroFn_;
            assembly {
                zeroFn_ := 0
            }
            function(uint256) pure returns (uint256)[LOCAL_OPS_LENGTH + 1]
                memory fns_ = [
                    // will be overriden with length
                    zeroFn_,
                    // approved evidence
                    AllStandardOps.one
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }

    function localStackPushesFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory)
    {
        unchecked {
            uint256 lenBytes_ = LOCAL_OPS_LENGTH * 0x20;
            function(uint256) pure returns (uint256) zeroFn_;
            assembly {
                zeroFn_ := 0
            }
            function(uint256) pure returns (uint256)[LOCAL_OPS_LENGTH + 1]
                memory fns_ = [
                    // will be overriden with length
                    zeroFn_,
                    // approved evidence
                    AllStandardOps.one
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }
}
