// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../RainVM.sol";
import "./erc20/OpERC20BalanceOf.sol";
import "./erc20/OpERC20TotalSupply.sol";
import "./erc20/snapshot/OpERC20SnapshotBalanceOfAt.sol";
import "./erc20/snapshot/OpERC20SnapshotTotalSupplyAt.sol";
import "./erc721/OpERC721BalanceOf.sol";
import "./erc721/OpERC721OwnerOf.sol";
import "./evm/OpBlockNumber.sol";
import "./evm/OpCaller.sol";
import "./evm/OpThisAddress.sol";
import "./evm/OpTimestamp.sol";
import "./math/FixedPointMathOps.sol";
import "./token/ERC1155Ops.sol";
import "./math/LogicOps.sol";
import "./math/MathOps.sol";
import "./tier/OpITierV2Report.sol";
import "./tier/OpITierV2ReportTimeForTier.sol";
import "./tier/OpSaturatingDiff.sol";
import "./tier/OpSelectLte.sol";
import "./tier/OpUpdateTimesForTierRange.sol";

uint256 constant ALL_STANDARD_OPS_LENGTH = RAIN_VM_OPS_LENGTH + 40;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    function zero(uint256) internal pure returns (uint256) {
        return 0;
    }

    function one(uint256) internal pure returns (uint256) {
        return 1;
    }

    function two(uint256) internal pure returns (uint256) {
        return 2;
    }

    function three(uint256) internal pure returns (uint256) {
        return 3;
    }

    function nonzeroOperandN(uint256 operand_) internal pure returns (uint256) {
        require(operand_ > 0, "0_OPERAND");
        return operand_;
    }

    function stackPopsFnPtrs() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256) pure returns (uint256) zeroFn_;
            assembly {
                // using zero bytes in the fnPtrs array may save gas in certain
                // contexts.
                zeroFn_ := 0
            }
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_LENGTH +
                1]
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
                    // erc20 balance of
                    two,
                    // erc20 total supply
                    one,
                    // erc20 snapshot balance of at
                    three,
                    // erc20 snapshot total supply at
                    two,
                    // erc721 balance of
                    two,
                    // erc721 owner of
                    two,
                    // block number
                    zero,
                    // caller
                    zero,
                    // this address
                    zero,
                    // timestamp
                    zero,
                    // scale18 mul
                    two,
                    // scale18 div
                    two,
                    // scale18
                    one,
                    // scaleN
                    one,
                    // scaleBy
                    one,
                    // add
                    nonzeroOperandN,
                    // saturating add
                    nonzeroOperandN,
                    // sub
                    nonzeroOperandN,
                    // saturating sub
                    nonzeroOperandN,
                    // mul
                    nonzeroOperandN,
                    // saturating mul
                    nonzeroOperandN,
                    // div
                    nonzeroOperandN,
                    // mod
                    nonzeroOperandN,
                    // exp
                    nonzeroOperandN,
                    // min
                    nonzeroOperandN,
                    // max
                    nonzeroOperandN,
                    // iszero
                    one,
                    // eager if
                    three,
                    // equal to
                    two,
                    // less than
                    two,
                    // greater than
                    two,
                    // every
                    nonzeroOperandN,
                    // any
                    nonzeroOperandN,
                    // tier report
                    OpITierV2Report.stackPops,
                    // tier report time for tier
                    OpITierV2ReportTimeForTier.stackPops,
                    // tier saturating diff
                    two,
                    // select lte
                    OpSelectLte.stackPops,
                    // update times for tier range
                    two,
                    // erc1155 balance of
                    three,
                    // erc1155 balance of batch
                    ERC1155Ops.stackPopsBalanceOfBatch
                ];
            bytes memory ret_;
            assembly {
                mstore(fns_, lenBytes_)
                ret_ := fns_
            }
            return ret_;
        }
    }

    function stackPushesFnPtrs() internal pure returns (bytes memory) {
        unchecked {
            uint256 lenBytes_ = ALL_STANDARD_OPS_LENGTH * 0x20;
            function(uint256) pure returns (uint256) zeroFn_;
            assembly {
                // using zero bytes in the fnPtrs array may save gas in certain
                // contexts.
                zeroFn_ := 0
            }
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_LENGTH +
                1]
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
                    // erc20 balance of
                    one,
                    // erc20 total supply
                    one,
                    // erc20 snapshot balance of at
                    one,
                    // erc20 snapshot total supply at
                    one,
                    // erc721 balance of
                    one,
                    // erc721 owner of
                    one,
                    // block number
                    one,
                    // caller
                    one,
                    // this address
                    one,
                    // timestamp
                    one,
                    // scale18 mul
                    one,
                    // scale18 div
                    one,
                    // scale18
                    one,
                    // scaleN
                    one,
                    // scaleBy
                    one,
                    // add
                    one,
                    // saturating add
                    one,
                    // sub
                    one,
                    // saturating sub
                    one,
                    // mul
                    one,
                    // saturating mul
                    one,
                    // div
                    one,
                    // mod
                    one,
                    // exp
                    one,
                    // min
                    one,
                    // max
                    one,
                    // iszero
                    one,
                    // eager if
                    one,
                    // equal to
                    one,
                    // less than
                    one,
                    // greater than
                    one,
                    // every
                    one,
                    // any
                    one,
                    // tier report
                    one,
                    // tier report time for tier
                    one,
                    // tier saturating diff
                    one,
                    // select lte
                    one,
                    // update times for tier range
                    one,
                    // erc1155 balance of
                    one,
                    // erc1155 balance of batch
                    nonzeroOperandN
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
                    OpERC20BalanceOf.balanceOf,
                    OpERC20TotalSupply.totalSupply,
                    OpERC20SnapshotBalanceOfAt.balanceOfAt,
                    OpERC20SnapshotTotalSupplyAt.totalSupplyAt,
                    OpERC721BalanceOf.balanceOf,
                    OpERC721OwnerOf.ownerOf,
                    OpBlockNumber.blockNumber,
                    OpCaller.caller,
                    OpThisAddress.thisAddress,
                    OpTimestamp.timestamp,
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
                    OpITierV2Report.report,
                    OpITierV2ReportTimeForTier.reportTimeForTier,
                    OpSaturatingDiff.saturatingDiff,
                    OpSelectLte.selectLte,
                    OpUpdateTimesForTierRange.updateTimesForTierRange,
                    ERC1155Ops.balanceOf,
                    ERC1155Ops.balanceOfBatch
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
