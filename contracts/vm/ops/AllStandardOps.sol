// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../RainVM.sol";
import "./erc20/OpERC20BalanceOf.sol";
import "./erc20/OpERC20TotalSupply.sol";
import "./erc20/snapshot/OpERC20SnapshotBalanceOfAt.sol";
import "./erc20/snapshot/OpERC20SnapshotTotalSupplyAt.sol";
import "./erc721/OpERC721BalanceOf.sol";
import "./erc721/OpERC721OwnerOf.sol";
import "./erc1155/OpERC1155BalanceOf.sol";
import "./erc1155/OpERC1155BalanceOfBatch.sol";
import "./evm/OpBlockNumber.sol";
import "./evm/OpCaller.sol";
import "./evm/OpThisAddress.sol";
import "./evm/OpTimestamp.sol";
import "./math/fixedPoint/OpFixedPointScale18.sol";
import "./math/fixedPoint/OpFixedPointScale18Div.sol";
import "./math/fixedPoint/OpFixedPointScale18Mul.sol";
import "./math/fixedPoint/OpFixedPointScaleBy.sol";
import "./math/fixedPoint/OpFixedPointScaleN.sol";
import "./math/logic/OpAny.sol";
import "./math/logic/OpEagerIf.sol";
import "./math/logic/OpEqualTo.sol";
import "./math/logic/OpEvery.sol";
import "./math/logic/OpGreaterThan.sol";
import "./math/logic/OpIsZero.sol";
import "./math/logic/OpLessThan.sol";
import "./math/saturating/OpSaturatingAdd.sol";
import "./math/saturating/OpSaturatingMul.sol";
import "./math/saturating/OpSaturatingSub.sol";
import "./math/OpAdd.sol";
import "./math/OpDiv.sol";
import "./math/OpExp.sol";
import "./math/OpMax.sol";
import "./math/OpMin.sol";
import "./math/OpMod.sol";
import "./math/OpMul.sol";
import "./math/OpSub.sol";
import "./tier/OpITierV2Report.sol";
import "./tier/OpITierV2ReportTimeForTier.sol";
import "./tier/OpSaturatingDiff.sol";
import "./tier/OpSelectLte.sol";
import "./tier/OpUpdateTimesForTierRange.sol";
import "../../memory/coerce/CoerceFnPtrs.sol";

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

    function stackPopsFnPtrs() internal pure returns (uint256[] memory ptrs_) {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory fns_ = [
                ALL_STANDARD_OPS_LENGTH,
                // constant placeholder
                0,
                // stack placeholder
                0,
                // context placeholder
                0,
                // storage placeholder
                0,
                // zipmap placeholder
                0,
                // debug placeholder
                0,
                // erc20 balance of
                CoerceFnPtrs.toUint256(two),
                // erc20 total supply
                CoerceFnPtrs.toUint256(one),
                // erc20 snapshot balance of at
                CoerceFnPtrs.toUint256(three),
                // erc20 snapshot total supply at
                CoerceFnPtrs.toUint256(two),
                // erc721 balance of
                CoerceFnPtrs.toUint256(two),
                // erc721 owner of
                CoerceFnPtrs.toUint256(two),
                // erc1155 balance of
                CoerceFnPtrs.toUint256(three),
                // erc1155 balance of batch
                CoerceFnPtrs.toUint256(OpERC1155BalanceOfBatch.stackPops),
                // block number
                CoerceFnPtrs.toUint256(zero),
                // caller
                CoerceFnPtrs.toUint256(zero),
                // this address
                CoerceFnPtrs.toUint256(zero),
                // timestamp
                CoerceFnPtrs.toUint256(zero),
                // scale18
                CoerceFnPtrs.toUint256(one),
                // scale18 div
                CoerceFnPtrs.toUint256(two),
                // scale18 mul
                CoerceFnPtrs.toUint256(two),
                // scaleBy
                CoerceFnPtrs.toUint256(one),
                // scaleN
                CoerceFnPtrs.toUint256(one),
                // any
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // eager if
                CoerceFnPtrs.toUint256(three),
                // equal to
                CoerceFnPtrs.toUint256(two),
                // every
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // greater than
                CoerceFnPtrs.toUint256(two),
                // iszero
                CoerceFnPtrs.toUint256(one),
                // less than
                CoerceFnPtrs.toUint256(two),
                // saturating add
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // saturating mul
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // saturating sub
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // add
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // div
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // exp
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // max
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // min
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // mod
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // mul
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // sub
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // tier report
                CoerceFnPtrs.toUint256(OpITierV2Report.stackPops),
                // tier report time for tier
                CoerceFnPtrs.toUint256(OpITierV2ReportTimeForTier.stackPops),
                // tier saturating diff
                CoerceFnPtrs.toUint256(two),
                // select lte
                CoerceFnPtrs.toUint256(OpSelectLte.stackPops),
                // update times for tier range
                CoerceFnPtrs.toUint256(two)
            ];
            assembly {
                ptrs_ := fns_
            }
        }
    }

    function stackPushesFnPtrs()
        internal
        pure
        returns (uint256[] memory ptrs_)
    {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory fns_ = [
                ALL_STANDARD_OPS_LENGTH,
                // constant placeholder
                0,
                // stack placeholder
                0,
                // context placeholder
                0,
                // storage placeholder
                0,
                // zipmap placeholder
                0,
                // debug placeholder
                0,
                // erc20 balance of
                CoerceFnPtrs.toUint256(one),
                // erc20 total supply
                CoerceFnPtrs.toUint256(one),
                // erc20 snapshot balance of at
                CoerceFnPtrs.toUint256(one),
                // erc20 snapshot total supply at
                CoerceFnPtrs.toUint256(one),
                // erc721 balance of
                CoerceFnPtrs.toUint256(one),
                // erc721 owner of
                CoerceFnPtrs.toUint256(one),
                // erc1155 balance of
                CoerceFnPtrs.toUint256(one),
                // erc1155 balance of batch
                CoerceFnPtrs.toUint256(nonzeroOperandN),
                // block number
                CoerceFnPtrs.toUint256(one),
                // caller
                CoerceFnPtrs.toUint256(one),
                // this address
                CoerceFnPtrs.toUint256(one),
                // timestamp
                CoerceFnPtrs.toUint256(one),
                // scale18
                CoerceFnPtrs.toUint256(one),
                // scale18 div
                CoerceFnPtrs.toUint256(one),
                // scale18 mul
                CoerceFnPtrs.toUint256(one),
                // scaleBy
                CoerceFnPtrs.toUint256(one),
                // scaleN
                CoerceFnPtrs.toUint256(one),
                // any
                CoerceFnPtrs.toUint256(one),
                // eager if
                CoerceFnPtrs.toUint256(one),
                // equal to
                CoerceFnPtrs.toUint256(one),
                // every
                CoerceFnPtrs.toUint256(one),
                // greater than
                CoerceFnPtrs.toUint256(one),
                // iszero
                CoerceFnPtrs.toUint256(one),
                // less than
                CoerceFnPtrs.toUint256(one),
                // saturating add
                CoerceFnPtrs.toUint256(one),
                // saturating mul
                CoerceFnPtrs.toUint256(one),
                // saturating sub
                CoerceFnPtrs.toUint256(one),
                // add
                CoerceFnPtrs.toUint256(one),
                // div
                CoerceFnPtrs.toUint256(one),
                // exp
                CoerceFnPtrs.toUint256(one),
                // max
                CoerceFnPtrs.toUint256(one),
                // min
                CoerceFnPtrs.toUint256(one),
                // mod
                CoerceFnPtrs.toUint256(one),
                // mul
                CoerceFnPtrs.toUint256(one),
                // sub
                CoerceFnPtrs.toUint256(one),
                // tier report
                CoerceFnPtrs.toUint256(one),
                // tier report time for tier
                CoerceFnPtrs.toUint256(one),
                // tier saturating diff
                CoerceFnPtrs.toUint256(one),
                // select lte
                CoerceFnPtrs.toUint256(one),
                // update times for tier range
                CoerceFnPtrs.toUint256(one)
            ];
            assembly {
                ptrs_ := fns_
            }
        }
    }

    function fnPtrs() internal pure returns (uint256[] memory ptrs_) {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory fns_ = [
                ALL_STANDARD_OPS_LENGTH,
                // placeholders for core ops
                // constant
                0,
                // stack
                0,
                // context
                0,
                // storage
                0,
                // zipmap
                0,
                // debug
                0,
                // dispatchable ops
                CoerceFnPtrs.toUint256(OpERC20BalanceOf.balanceOf),
                CoerceFnPtrs.toUint256(OpERC20TotalSupply.totalSupply),
                CoerceFnPtrs.toUint256(OpERC20SnapshotBalanceOfAt.balanceOfAt),
                CoerceFnPtrs.toUint256(
                    OpERC20SnapshotTotalSupplyAt.totalSupplyAt
                ),
                CoerceFnPtrs.toUint256(OpERC721BalanceOf.balanceOf),
                CoerceFnPtrs.toUint256(OpERC721OwnerOf.ownerOf),
                CoerceFnPtrs.toUint256(OpERC1155BalanceOf.balanceOf),
                CoerceFnPtrs.toUint256(OpERC1155BalanceOfBatch.balanceOfBatch),
                CoerceFnPtrs.toUint256(OpBlockNumber.blockNumber),
                CoerceFnPtrs.toUint256(OpCaller.caller),
                CoerceFnPtrs.toUint256(OpThisAddress.thisAddress),
                CoerceFnPtrs.toUint256(OpTimestamp.timestamp),
                CoerceFnPtrs.toUint256(OpFixedPointScale18.scale18),
                CoerceFnPtrs.toUint256(OpFixedPointScale18Div.scale18Div),
                CoerceFnPtrs.toUint256(OpFixedPointScale18Mul.scale18Mul),
                CoerceFnPtrs.toUint256(OpFixedPointScaleBy.scaleBy),
                CoerceFnPtrs.toUint256(OpFixedPointScaleN.scaleN),
                CoerceFnPtrs.toUint256(OpAny.any),
                CoerceFnPtrs.toUint256(OpEagerIf.eagerIf),
                CoerceFnPtrs.toUint256(OpEqualTo.equalTo),
                CoerceFnPtrs.toUint256(OpEvery.every),
                CoerceFnPtrs.toUint256(OpGreaterThan.greaterThan),
                CoerceFnPtrs.toUint256(OpIsZero.isZero),
                CoerceFnPtrs.toUint256(OpLessThan.lessThan),
                CoerceFnPtrs.toUint256(OpSaturatingAdd.saturatingAdd),
                CoerceFnPtrs.toUint256(OpSaturatingMul.saturatingMul),
                CoerceFnPtrs.toUint256(OpSaturatingSub.saturatingSub),
                CoerceFnPtrs.toUint256(OpAdd.add),
                CoerceFnPtrs.toUint256(OpDiv.div),
                CoerceFnPtrs.toUint256(OpExp.exp),
                CoerceFnPtrs.toUint256(OpMax.max),
                CoerceFnPtrs.toUint256(OpMin.min),
                CoerceFnPtrs.toUint256(OpMod.mod),
                CoerceFnPtrs.toUint256(OpMul.mul),
                CoerceFnPtrs.toUint256(OpSub.sub),
                CoerceFnPtrs.toUint256(OpITierV2Report.report),
                CoerceFnPtrs.toUint256(
                    OpITierV2ReportTimeForTier.reportTimeForTier
                ),
                CoerceFnPtrs.toUint256(OpSaturatingDiff.saturatingDiff),
                CoerceFnPtrs.toUint256(OpSelectLte.selectLte),
                CoerceFnPtrs.toUint256(
                    OpUpdateTimesForTierRange.updateTimesForTierRange
                )
            ];
            assembly {
                ptrs_ := fns_
            }
        }
    }
}
