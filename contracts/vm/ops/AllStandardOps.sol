// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../../type/LibCast.sol";
import "../../type/LibConvert.sol";
import "../../array/LibUint256Array.sol";
import "../../bytes/LibPackBytes.sol";
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

uint256 constant ALL_STANDARD_OPS_LENGTH = RAIN_VM_OPS_LENGTH + 40;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    using LibCast for uint256;
    using LibCast for function(uint256) pure returns (uint256);
    using LibCast for function(uint256, StackTop) view returns (StackTop);
    using LibCast for function(uint256, StackTop) pure returns (StackTop);
    using LibCast for function(uint256, StackTop) view returns (StackTop)[];
    using AllStandardOps for uint256[ALL_STANDARD_OPS_LENGTH + 1];
    using LibUint256Array for uint256[];
    using LibConvert for uint256[];
    using LibPackBytes for bytes;

    /// An oddly specific conversion between a fixed and dynamic uint256 array.
    /// This is useful for the purpose of building metadata for bounds checks
    /// and dispatch of all the standard ops provided by RainVM.
    /// The cast will fail if the length of the dynamic array doesn't match the
    /// first item of the fixed array; it relies on differences in memory
    /// layout in Solidity that MAY change in the future. The rollback guards
    /// against changes in Solidity memory layout silently breaking this cast.
    /// @param fixed_ The fixed size uint array to cast to a dynamic uint array.
    /// Specifically the size is fixed to match the number of standard ops.
    /// @param dynamic_ The dynamic uint array with length of the standard ops.
    function asUint256Array(uint256[ALL_STANDARD_OPS_LENGTH + 1] memory fixed_)
        internal
        pure
        returns (uint256[] memory dynamic_)
    {
        assembly {
            dynamic_ := fixed_
        }
        require(
            dynamic_.length == ALL_STANDARD_OPS_LENGTH,
            "BAD_DYNAMIC_LENGTH"
        );
    }

    function nonZeroOperandN(uint256 operand_) internal pure returns (uint256) {
        require(operand_ > 0, "0_OPERAND_NZON");
        return operand_;
    }

    function stackPops(uint256[] memory locals_)
        internal
        pure
        returns (uint256[] memory pops_)
    {
        unchecked {
            uint256 nonZeroOperandN_ = nonZeroOperandN.asUint256();
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory popsFixed_ = [
                ALL_STANDARD_OPS_LENGTH,
                // opcode constant
                0,
                // opcode stack
                0,
                // opcode context
                0,
                // opcode storage
                0,
                // opcode zipmap (ignored)
                0,
                // opcode debug
                0,
                // erc20 balance of
                2,
                // erc20 total supply
                1,
                // erc20 snapshot balance of at
                3,
                // erc20 snapshot total supply at
                2,
                // erc721 balance of
                2,
                // erc721 owner of
                2,
                // erc1155 balance of
                3,
                // erc1155 balance of batch
                OpERC1155BalanceOfBatch.stackPops.asUint256(),
                OpBlockNumber.POPS,
                // caller
                0,
                // this address
                0,
                // timestamp
                0,
                // scale18
                1,
                // scale18 div
                2,
                // scale18 mul
                2,
                // scaleBy
                1,
                // scaleN
                1,
                // any
                nonZeroOperandN_,
                // eager if
                3,
                // equal to
                2,
                // every
                nonZeroOperandN_,
                // greater than
                2,
                // iszero
                1,
                // less than
                2,
                // saturating add
                nonZeroOperandN_,
                // saturating mul
                nonZeroOperandN_,
                // saturating sub
                nonZeroOperandN_,
                // add
                nonZeroOperandN_,
                // div
                nonZeroOperandN_,
                // exp
                nonZeroOperandN_,
                // max
                nonZeroOperandN_,
                // min
                nonZeroOperandN_,
                // mod
                nonZeroOperandN_,
                // mul
                nonZeroOperandN_,
                // sub
                nonZeroOperandN_,
                // tier report
                OpITierV2Report.stackPops.asUint256(),
                // tier report time for tier
                OpITierV2ReportTimeForTier.stackPops.asUint256(),
                // tier saturating diff
                2,
                // select lte
                OpSelectLte.stackPops.asUint256(),
                // update times for tier range
                2
            ];
            pops_ = popsFixed_.asUint256Array();
            pops_.extend(locals_);
        }
    }

    function stackPushes(uint256[] memory locals_)
        internal
        pure
        returns (uint256[] memory pushes_)
    {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory pushesFixed_ = [
                ALL_STANDARD_OPS_LENGTH,
                // opcode constant
                1,
                // opcode stack
                1,
                // opcode context
                1,
                // opcode storage
                1,
                // opcode zipmap (will be ignored)
                0,
                // opcode debug
                1,
                // erc20 balance of
                1,
                // erc20 total supply
                1,
                // erc20 snapshot balance of at
                1,
                // erc20 snapshot total supply at
                1,
                // erc721 balance of
                1,
                // erc721 owner of
                1,
                // erc1155 balance of
                1,
                // erc1155 balance of batch
                nonZeroOperandN.asUint256(),
                OpBlockNumber.PUSHES,
                // caller
                1,
                // this address
                1,
                // timestamp
                1,
                // scale18
                1,
                // scale18 div
                1,
                // scale18 mul
                1,
                // scaleBy
                1,
                // scaleN
                1,
                // any
                1,
                // eager if
                1,
                // equal to
                1,
                // every
                1,
                // greater than
                1,
                // iszero
                1,
                // less than
                1,
                // saturating add
                1,
                // saturating mul
                1,
                // saturating sub
                1,
                // add
                1,
                // div
                1,
                // exp
                1,
                // max
                1,
                // min
                1,
                // mod
                1,
                // mul
                1,
                // sub
                1,
                // tier report
                1,
                // tier report time for tier
                1,
                // tier saturating diff
                1,
                // select lte
                1,
                // update times for tier range
                1
            ];
            pushes_ = pushesFixed_.asUint256Array();
            pushes_.extend(locals_);
        }
    }

    function packedFunctionPointers(
        function(uint256, StackTop) view returns (StackTop)[] memory locals_
    ) internal pure returns (bytes memory packedFunctionPointers_) {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory pointersFixed_ = [
                ALL_STANDARD_OPS_LENGTH,
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
                OpERC20BalanceOf.balanceOf.asUint256(),
                OpERC20TotalSupply.totalSupply.asUint256(),
                OpERC20SnapshotBalanceOfAt.balanceOfAt.asUint256(),
                OpERC20SnapshotTotalSupplyAt.totalSupplyAt.asUint256(),
                OpERC721BalanceOf.balanceOf.asUint256(),
                OpERC721OwnerOf.ownerOf.asUint256(),
                OpERC1155BalanceOf.balanceOf.asUint256(),
                OpERC1155BalanceOfBatch.balanceOfBatch.asUint256(),
                OpBlockNumber.blockNumber.asUint256(),
                OpCaller.caller.asUint256(),
                OpThisAddress.thisAddress.asUint256(),
                OpTimestamp.timestamp.asUint256(),
                OpFixedPointScale18.scale18.asUint256(),
                OpFixedPointScale18Div.scale18Div.asUint256(),
                OpFixedPointScale18Mul.scale18Mul.asUint256(),
                OpFixedPointScaleBy.scaleBy.asUint256(),
                OpFixedPointScaleN.scaleN.asUint256(),
                OpAny.any.asUint256(),
                OpEagerIf.eagerIf.asUint256(),
                OpEqualTo.equalTo.asUint256(),
                OpEvery.every.asUint256(),
                OpGreaterThan.greaterThan.asUint256(),
                OpIsZero.isZero.asUint256(),
                OpLessThan.lessThan.asUint256(),
                OpSaturatingAdd.saturatingAdd.asUint256(),
                OpSaturatingMul.saturatingMul.asUint256(),
                OpSaturatingSub.saturatingSub.asUint256(),
                OpAdd.add.asUint256(),
                OpDiv.div.asUint256(),
                OpExp.exp.asUint256(),
                OpMax.max.asUint256(),
                OpMin.min.asUint256(),
                OpMod.mod.asUint256(),
                OpMul.mul.asUint256(),
                OpSub.sub.asUint256(),
                OpITierV2Report.report.asUint256(),
                OpITierV2ReportTimeForTier.reportTimeForTier.asUint256(),
                OpSaturatingDiff.saturatingDiff.asUint256(),
                OpSelectLte.selectLte.asUint256(),
                OpUpdateTimesForTierRange.updateTimesForTierRange.asUint256()
            ];
            uint256[] memory pointers_ = pointersFixed_.asUint256Array();
            pointers_.extend(locals_.asUint256Array());
            packedFunctionPointers_ = pointers_.toBytes();
            packedFunctionPointers_.pack32To2();
        }
    }
}
