// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/VMStateBuilder.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";

contract OrderBookStateBuilder is VMStateBuilder {
    function localStackPopsFnPtrs() internal pure returns (bytes memory) {
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
                    // order funds cleared
                    AllStandardOps.one,
                    // order counterparty funds cleared
                    AllStandardOps.two
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }

    function localStackPushesFnPtrs() internal pure returns (bytes memory) {
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
                    // order funds cleared
                    AllStandardOps.one,
                    // order counterparty funds cleared
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

    /// @inheritdoc VMStateBuilder
    function stackPopsFnPtrs() public pure override returns (bytes memory) {
        return
            bytes.concat(
                AllStandardOps.stackPopsFnPtrs(),
                localStackPopsFnPtrs()
            );
    }

    /// @inheritdoc VMStateBuilder
    function stackPushesFnPtrs() public pure override returns (bytes memory) {
        return
            bytes.concat(
                AllStandardOps.stackPushesFnPtrs(),
                localStackPushesFnPtrs()
            );
    }
}
