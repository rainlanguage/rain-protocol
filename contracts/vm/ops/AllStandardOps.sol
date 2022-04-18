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
    // using LibDispatchTable for DispatchTable;

    // function stackIndexDiff(uint256 opcode_, uint256 operand_)
    //     internal
    //     pure
    //     returns (int256)
    // {
    //     if (opcode_ < FP_MATH_OPS_START) {
    //         return EVMConstantOps.stackIndexDiff(opcode_, operand_);
    //     } else if (opcode_ < MATH_OPS_START) {
    //         return
    //             FixedPointMathOps.stackIndexDiff(
    //                 opcode_ - FP_MATH_OPS_START,
    //                 operand_
    //             );
    //     } else if (opcode_ < LOGIC_OPS_START) {
    //         return MathOps.stackIndexDiff(opcode_ - MATH_OPS_START, operand_);
    //     } else if (opcode_ < TIER_OPS_START) {
    //         return LogicOps.stackIndexDiff(opcode_ - LOGIC_OPS_START, operand_);
    //     } else if (opcode_ < IERC20_OPS_START) {
    //         return TierOps.stackIndexDiff(opcode_ - TIER_OPS_START, operand_);
    //     } else if (opcode_ < IERC721_OPS_START) {
    //         return
    //             IERC20Ops.stackIndexDiff(opcode_ - IERC20_OPS_START, operand_);
    //     } else if (opcode_ < IERC1155_OPS_START) {
    //         return
    //             IERC721Ops.stackIndexDiff(
    //                 opcode_ - IERC721_OPS_START,
    //                 operand_
    //             );
    //     } else {
    //         return
    //             IERC1155Ops.stackIndexDiff(
    //                 opcode_ - IERC1155_OPS_START,
    //                 operand_
    //             );
    //     }
    // }

    function stackIndexDiffNegTwo(uint256) internal pure returns (int256) {
        return -2;
    }

    function stackIndexDiffNegOne(uint256) internal pure returns (int256) {
        return -1;
    }

    function stackIndexDiffZero(uint256) internal pure returns (int256) {
        return 0;
    }

    function stackIndexDiffOne(uint256) internal pure returns (int256) {
        return 1;
    }

    function stackIndexDiffFnPtrs() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256) pure returns (int256)[ALL_STANDARD_OPS_LENGTH + 1]
                memory fns_ = [
                    // will be overriden with length
                    stackIndexDiffZero,
                    // constant
                    stackIndexDiffOne,
                    // stack
                    stackIndexDiffOne,
                    // context
                    stackIndexDiffOne,
                    // storage
                    stackIndexDiffOne,
                    // zipmap
                    // This will be ignored by the analyzer as zipmap is a special
                    // case.
                    stackIndexDiffZero,
                    // debug
                    stackIndexDiffZero,
                    // block number
                    stackIndexDiffOne,
                    // timestamp
                    stackIndexDiffOne,
                    // caller
                    stackIndexDiffOne,
                    // this address
                    stackIndexDiffOne,
                    // scale18 mul
                    stackIndexDiffNegOne,
                    // scale18 div
                    stackIndexDiffNegOne,
                    // scale18
                    stackIndexDiffZero,
                    // scaleN
                    stackIndexDiffZero,
                    // scaleBy
                    stackIndexDiffZero,
                    // add
                    MathOps.stackIndexDiff,
                    // saturating add
                    MathOps.stackIndexDiff,
                    // sub
                    MathOps.stackIndexDiff,
                    // saturating sub
                    MathOps.stackIndexDiff,
                    // mul
                    MathOps.stackIndexDiff,
                    // saturating mul
                    MathOps.stackIndexDiff,
                    // div
                    MathOps.stackIndexDiff,
                    // mod
                    MathOps.stackIndexDiff,
                    // exp
                    MathOps.stackIndexDiff,
                    // min
                    MathOps.stackIndexDiff,
                    // max
                    MathOps.stackIndexDiff,
                    // iszero
                    stackIndexDiffZero,
                    // eager if
                    stackIndexDiffNegTwo,
                    // equal to
                    stackIndexDiffNegOne,
                    // less than
                    stackIndexDiffNegOne,
                    // greater than
                    stackIndexDiffNegOne,
                    // every
                    LogicOps.stackIndexDiffEveryAny,
                    // any
                    LogicOps.stackIndexDiffEveryAny,
                    // tier report
                    stackIndexDiffNegOne,
                    // tier saturating diff
                    stackIndexDiffNegOne,
                    // update blocks for tier range
                    stackIndexDiffNegOne,
                    // select lte
                    TierOps.stackIndexDiffSelectLte,
                    // ierc20 balance of
                    stackIndexDiffNegOne,
                    // ierc20 total supply
                    stackIndexDiffZero,
                    // ierc721 balance of
                    stackIndexDiffNegOne,
                    // ierc721 owner of
                    stackIndexDiffNegOne,
                    // ierc1155 balance of
                    stackIndexDiffNegTwo,
                    // ierc1155 balance of batch
                    IERC1155Ops.stackIndexDiffBalanceOfBatch
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
