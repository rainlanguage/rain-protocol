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
import "./list/OpExplode32.sol";
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

uint256 constant ALL_STANDARD_OPS_LENGTH = RAIN_VM_OPS_LENGTH + 41;

/// @title AllStandardOps
/// @notice RainVM opcode pack to expose all other packs.
library AllStandardOps {
    using LibCast for uint256;
    using LibCast for function(uint256) pure returns (uint256);
    using LibCast for function(VMState memory, uint256, StackTop) view returns (StackTop);
    using LibCast for function(VMState memory, uint256, StackTop) pure returns (StackTop);
    using LibCast for function(VMState memory, uint256, StackTop) view returns (StackTop)[];
    using AllStandardOps for function(uint256)
        pure
        returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1];
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
    function asUint256Array(
        function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1]
            memory fixed_
    ) internal pure returns (uint256[] memory dynamic_) {
        assembly ("memory-safe") {
            dynamic_ := fixed_
        }
        require(
            dynamic_.length == ALL_STANDARD_OPS_LENGTH,
            "BAD_DYNAMIC_LENGTH"
        );
    }

    function asUint256Array(uint256[ALL_STANDARD_OPS_LENGTH + 1] memory fixed_)
        internal
        pure
        returns (uint256[] memory dynamic_)
    {
        assembly ("memory-safe") {
            dynamic_ := fixed_
        }
        require(
            dynamic_.length == ALL_STANDARD_OPS_LENGTH,
            "BAD_DYNAMIC_LENGTH"
        );
    }

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

    function eight(uint256) internal pure returns (uint256) {
        return 8;
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
            // uint256 nonZeroOperandN_ = nonZeroOperandN.asUint256();
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_LENGTH +
                1]
                memory popsFixed_ = [
                    ALL_STANDARD_OPS_LENGTH.asStackMoveFn(),
                    // memory
                    zero,
                    // call (ignored)
                    zero,
                    // loop n (ignored)
                    zero,
                    // loop if (ignored)
                    zero,
                    // opcode storage
                    zero,
                    // opcode debug
                    zero,
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
                    // erc1155 balance of
                    three,
                    // erc1155 balance of batch
                    OpERC1155BalanceOfBatch.stackPops,
                    // block number
                    zero,
                    // caller
                    zero,
                    // this address
                    zero,
                    // timestamp
                    zero,
                    // explode32
                    one,
                    // scale18
                    one,
                    // scale18 div
                    two,
                    // scale18 mul
                    two,
                    // scaleBy
                    one,
                    // scaleN
                    one,
                    // any
                    nonZeroOperandN,
                    // eager if
                    three,
                    // equal to
                    two,
                    // every
                    nonZeroOperandN,
                    // greater than
                    two,
                    // iszero
                    one,
                    // less than
                    two,
                    // saturating add
                    nonZeroOperandN,
                    // saturating mul
                    nonZeroOperandN,
                    // saturating sub
                    nonZeroOperandN,
                    // add
                    nonZeroOperandN,
                    // div
                    nonZeroOperandN,
                    // exp
                    nonZeroOperandN,
                    // max
                    nonZeroOperandN,
                    // min
                    nonZeroOperandN,
                    // mod
                    nonZeroOperandN,
                    // mul
                    nonZeroOperandN,
                    // sub
                    nonZeroOperandN,
                    // tier report
                    OpITierV2Report.stackPops,
                    // tier report time for tier
                    OpITierV2ReportTimeForTier.stackPops,
                    // tier saturating diff
                    two,
                    // select lte
                    OpSelectLte.stackPops,
                    // update times for tier range
                    two
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
            function(uint256) pure returns (uint256)[ALL_STANDARD_OPS_LENGTH +
                1]
                memory pushesFixed_ = [
                    ALL_STANDARD_OPS_LENGTH.asStackMoveFn(),
                    // memory
                    one,
                    // call (ignored)
                    zero,
                    // loop n (ignored)
                    zero,
                    // loop if (ignored)
                    zero,
                    // storage
                    one,
                    // opcode debug
                    one,
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
                    // erc1155 balance of
                    one,
                    // erc1155 balance of batch
                    nonZeroOperandN,
                    // block number
                    one,
                    // caller
                    one,
                    // this address
                    one,
                    // timestamp
                    one,
                    // explode32
                    eight,
                    // scale18
                    one,
                    // scale18 div
                    one,
                    // scale18 mul
                    one,
                    // scaleBy
                    one,
                    // scaleN
                    one,
                    // any
                    one,
                    // eager if
                    one,
                    // equal to
                    one,
                    // every
                    one,
                    // greater than
                    one,
                    // iszero
                    one,
                    // less than
                    one,
                    // saturating add
                    one,
                    // saturating mul
                    one,
                    // saturating sub
                    one,
                    // add
                    one,
                    // div
                    one,
                    // exp
                    one,
                    // max
                    one,
                    // min
                    one,
                    // mod
                    one,
                    // mul
                    one,
                    // sub
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
                    one
                ];
            pushes_ = pushesFixed_.asUint256Array();
            pushes_.extend(locals_);
        }
    }

    function packedFunctionPointers(
        function(VMState memory, uint256, StackTop) view returns (StackTop)[] memory locals_
    ) internal pure returns (bytes memory packedFunctionPointers_) {
        unchecked {
            uint256[ALL_STANDARD_OPS_LENGTH + 1] memory pointersFixed_ = [
                ALL_STANDARD_OPS_LENGTH,
                // memory
                0,
                // call
                0,
                // loop n
                0,
                // loop if
                0,
                // storage
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
                OpExplode32.explode32.asUint256(),
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
