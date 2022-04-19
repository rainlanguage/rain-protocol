// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../RainVM.sol";
import "./evm/EVMConstantOps.sol";
import "./math/FixedPointMathOps.sol";
import "./token/IERC20Ops.sol";
import "./token/IERC721Ops.sol";
import "./token/IERC1155Ops.sol";
import "./math/LogicOps.sol";
import "./math/MathOps.sol";
import "./tier/TierOps.sol";

uint256 constant ALL_STANDARD_OPS_LENGTH = RAIN_VM_OPS_LENGTH + 37;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    function stackIndexMoveNegTwo(uint256, uint256 stackIndex_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackIndex_ := sub(stackIndex_, 2)
        }
        return stackIndex_;
    }

    function stackIndexMoveNegOne(uint256, uint256 stackIndex_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackIndex_ := sub(stackIndex_, 1)
        }
        return stackIndex_;
    }

    function stackIndexMoveZero(uint256, uint256 stackIndex_)
        internal
        pure
        returns (uint256)
    {
        return stackIndex_;
    }

    function stackIndexMoveOne(uint256, uint256 stackIndex_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackIndex_ := add(stackIndex_, 1)
        }
        return stackIndex_;
    }

    function stackIndexMoveFnPtrs() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256, uint256) pure returns (uint256) zeroFn_;
            assembly {
                // using zero bytes in the fnPtrs array may save gas in certain
                // contexts.
                zeroFn_ := 0
            }
            function(uint256, uint256)
                pure
                returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1]
                memory fns_ = [
                    // will be overriden with length
                    zeroFn_,
                    // constant placeholder
                    zeroFn_,
                    // stack placeholder
                    zeroFn_,
                    // context placeholder
                    zeroFn_,
                    // storage placeholder
                    zeroFn_,
                    // zipmap placeholder
                    zeroFn_,
                    // debug placeholder
                    zeroFn_,
                    // block number
                    stackIndexMoveOne,
                    // timestamp
                    stackIndexMoveOne,
                    // caller
                    stackIndexMoveOne,
                    // this address
                    stackIndexMoveOne,
                    // scale18 mul
                    stackIndexMoveNegOne,
                    // scale18 div
                    stackIndexMoveNegOne,
                    // scale18
                    stackIndexMoveZero,
                    // scaleN
                    stackIndexMoveZero,
                    // scaleBy
                    stackIndexMoveZero,
                    // add
                    MathOps.stackIndexMove,
                    // saturating add
                    MathOps.stackIndexMove,
                    // sub
                    MathOps.stackIndexMove,
                    // saturating sub
                    MathOps.stackIndexMove,
                    // mul
                    MathOps.stackIndexMove,
                    // saturating mul
                    MathOps.stackIndexMove,
                    // div
                    MathOps.stackIndexMove,
                    // mod
                    MathOps.stackIndexMove,
                    // exp
                    MathOps.stackIndexMove,
                    // min
                    MathOps.stackIndexMove,
                    // max
                    MathOps.stackIndexMove,
                    // iszero
                    stackIndexMoveZero,
                    // eager if
                    stackIndexMoveNegTwo,
                    // equal to
                    stackIndexMoveNegOne,
                    // less than
                    stackIndexMoveNegOne,
                    // greater than
                    stackIndexMoveNegOne,
                    // every
                    LogicOps.stackIndexMoveEveryAny,
                    // any
                    LogicOps.stackIndexMoveEveryAny,
                    // tier report
                    stackIndexMoveNegOne,
                    // tier saturating diff
                    stackIndexMoveNegOne,
                    // update blocks for tier range
                    stackIndexMoveNegOne,
                    // select lte
                    TierOps.stackIndexMoveSelectLte,
                    // ierc20 balance of
                    stackIndexMoveNegOne,
                    // ierc20 total supply
                    stackIndexMoveZero,
                    // ierc721 balance of
                    stackIndexMoveNegOne,
                    // ierc721 owner of
                    stackIndexMoveNegOne,
                    // ierc1155 balance of
                    stackIndexMoveNegTwo,
                    // ierc1155 balance of batch
                    IERC1155Ops.stackIndexMoveBalanceOfBatch
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }

    function fnPtrs() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256, uint256) view returns (uint256) zeroFn_;
            assembly {
                // using zero bytes in the fnPtrs array may save gas in certain
                // contexts.
                zeroFn_ := 0
            }
            function(uint256, uint256)
                view
                returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1]
                memory fns_ = [
                    // will be overridden with length
                    zeroFn_,
                    // placeholders for core ops
                    // constant
                    zeroFn_,
                    // stack
                    zeroFn_,
                    // context
                    zeroFn_,
                    // storage
                    zeroFn_,
                    // zipmap
                    zeroFn_,
                    // debug
                    zeroFn_,
                    // dispatchable ops
                    EVMConstantOps.number,
                    EVMConstantOps.timestamp,
                    EVMConstantOps.caller,
                    EVMConstantOps.thisAddress,
                    FixedPointMathOps.scale18Mul,
                    FixedPointMathOps.scale18Div,
                    FixedPointMathOps.scale18,
                    FixedPointMathOps.scaleN,
                    FixedPointMathOps.scaleBy,
                    MathOps.add,
                    MathOps.saturatingAdd,
                    MathOps.sub,
                    MathOps.saturatingSub,
                    MathOps.mul,
                    MathOps.saturatingMul,
                    MathOps.div,
                    MathOps.mod,
                    MathOps.exp,
                    MathOps.min,
                    MathOps.max,
                    LogicOps.isZero,
                    LogicOps.eagerIf,
                    LogicOps.equalTo,
                    LogicOps.lessThan,
                    LogicOps.greaterThan,
                    LogicOps.every,
                    LogicOps.any,
                    TierOps.report,
                    TierOps.saturatingDiff,
                    TierOps.updateBlocksForTierRange,
                    TierOps.selectLte,
                    IERC20Ops.balanceOf,
                    IERC20Ops.totalSupply,
                    IERC721Ops.balanceOf,
                    IERC721Ops.ownerOf,
                    IERC1155Ops.balanceOf,
                    IERC1155Ops.balanceOfBatch
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
