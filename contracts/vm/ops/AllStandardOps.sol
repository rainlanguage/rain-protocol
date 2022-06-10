// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {LibFnPtrs} from "../VMStateBuilder.sol";
import "../RainVM.sol";
import "./evm/EVMConstantOps.sol";
import "./math/FixedPointMathOps.sol";
import "./erc20/OpERC20BalanceOf.sol";
import "./erc20/OpERC20TotalSupply.sol";
import "./erc20/snapshot/OpERC20SnapshotBalanceOfAt.sol";
import "./erc20/snapshot/OpERC20SnapshotTotalSupplyAt.sol";
import "./token/ERC721Ops.sol";
import "./token/ERC1155Ops.sol";
import "./math/LogicOps.sol";
import "./math/MathOps.sol";
import "./tier/TierOps.sol";

uint256 constant ALL_STANDARD_OPS_COUNT = 39;
uint256 constant ALL_STANDARD_OPS_LENGTH = RAIN_VM_OPS_LENGTH +
    ALL_STANDARD_OPS_COUNT;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    using LibFnPtrs for bytes;

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

    function stackPopsFnPtrs() internal pure returns (bytes memory fnPtrs_) {
        unchecked {
            fnPtrs_ = new bytes(ALL_STANDARD_OPS_LENGTH * 0x20);
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_COUNT]
                memory fns_ = [
                    // erc20 balance of
                    two,
                    // erc20 total supply
                    one,
                    // erc20 snapshot balance of at
                    three,
                    // erc20 snapshot total supply at
                    two,
                    // block number
                    zero,
                    // timestamp
                    zero,
                    // caller
                    zero,
                    // this address
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
                    two,
                    // tier saturating diff
                    two,
                    // update blocks for tier range
                    two,
                    // select lte
                    TierOps.stackPopsSelectLte,
                    // erc721 balance of
                    two,
                    // erc721 owner of
                    two,
                    // erc1155 balance of
                    three,
                    // erc1155 balance of batch
                    ERC1155Ops.stackPopsBalanceOfBatch
                ];
            for (uint256 i_ = 0; i_ < ALL_STANDARD_OPS_COUNT; i_++) {
                fnPtrs_.insertStackMovePtr(i_ + RAIN_VM_OPS_LENGTH, fns_[i_]);
            }
        }
    }

    function stackPushesFnPtrs() internal pure returns (bytes memory fnPtrs_) {
        unchecked {
            fnPtrs_ = new bytes(ALL_STANDARD_OPS_LENGTH * 0x20);
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_COUNT]
                memory fns_ = [
                    // erc20 balance of
                    one,
                    // erc20 total supply
                    one,
                    // erc20 snapshot balance of at
                    one,
                    // erc20 snapshot total supply at
                    one,
                    // block number
                    one,
                    // timestamp
                    one,
                    // caller
                    one,
                    // this address
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
                    // tier saturating diff
                    one,
                    // update blocks for tier range
                    one,
                    // select lte
                    one,
                    // erc721 balance of
                    one,
                    // erc721 owner of
                    one,
                    // erc1155 balance of
                    one,
                    // erc1155 balance of batch
                    nonzeroOperandN
                ];
            for (uint256 i_ = 0; i_ < ALL_STANDARD_OPS_COUNT; i_++) {
                fnPtrs_.insertStackMovePtr(i_ + RAIN_VM_OPS_LENGTH, fns_[i_]);
            }
        }
    }

    function fnPtrs() internal pure returns (bytes memory fnPtrs_) {
        unchecked {
            fnPtrs_ = new bytes(ALL_STANDARD_OPS_LENGTH * 0x20);
            function(uint256, uint256)
                view
                returns (uint256)[ALL_STANDARD_OPS_COUNT]
                memory fns_ = [
                    OpERC20BalanceOf.balanceOf,
                    OpERC20TotalSupply.totalSupply,
                    OpERC20SnapshotBalanceOfAt.balanceOfAt,
                    OpERC20SnapshotTotalSupplyAt.totalSupplyAt,
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
                    ERC721Ops.balanceOf,
                    ERC721Ops.ownerOf,
                    ERC1155Ops.balanceOf,
                    ERC1155Ops.balanceOfBatch
                ];
            for (uint256 i_ = 0; i_ < ALL_STANDARD_OPS_COUNT; i_++) {
                fnPtrs_.insertOpPtr(i_ + RAIN_VM_OPS_LENGTH, fns_[i_]);
            }
        }
    }
}
