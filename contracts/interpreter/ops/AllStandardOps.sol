// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../type/LibCast.sol";
import "../../type/LibConvert.sol";
import "../../array/LibUint256Array.sol";
import "./chainlink/OpChainlinkOraclePrice.sol";
import "./core/OpCall.sol";
import "./core/OpSet.sol";
import "./core/OpContext.sol";
import "./core/OpContextRow.sol";
import "./core/OpDebug.sol";
import "./core/OpDoWhile.sol";
import "./core/OpFoldContext.sol";
import "./core/OpLoopN.sol";
import "./core/OpReadMemory.sol";
import "./crypto/OpHash.sol";
import "./erc20/OpERC20BalanceOf.sol";
import "./erc20/OpERC20TotalSupply.sol";
import "./erc20/snapshot/OpERC20SnapshotBalanceOfAt.sol";
import "./erc20/snapshot/OpERC20SnapshotTotalSupplyAt.sol";
import "./erc721/OpERC721BalanceOf.sol";
import "./erc721/OpERC721OwnerOf.sol";
import "./erc1155/OpERC1155BalanceOf.sol";
import "./erc1155/OpERC1155BalanceOfBatch.sol";
import "./error/OpEnsure.sol";
import "./evm/OpBlockNumber.sol";
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
import "./rain/IOrderBookV1/OpIOrderBookV1VaultBalance.sol";
import "./rain/ISaleV2/OpISaleV2RemainingTokenInventory.sol";
import "./rain/ISaleV2/OpISaleV2Reserve.sol";
import "./rain/ISaleV2/OpISaleV2SaleStatus.sol";
import "./rain/ISaleV2/OpISaleV2Token.sol";
import "./rain/ISaleV2/OpISaleV2TotalReserveReceived.sol";
import "./rain/IVerifyV1/OpIVerifyV1AccountStatusAtTime.sol";
import "./tier/OpITierV2Report.sol";
import "./tier/OpITierV2ReportTimeForTier.sol";
import "./tier/OpSaturatingDiff.sol";
import "./tier/OpSelectLte.sol";
import "./tier/OpUpdateTimesForTierRange.sol";

uint256 constant ALL_STANDARD_OPS_LENGTH = 58;

/// @title AllStandardOps
/// @notice RainInterpreter opcode pack to expose all other packs.
library AllStandardOps {
    using LibCast for uint256;
    using LibCast for function(uint256) pure returns (uint256);
    using LibCast for function(InterpreterState memory, uint256, StackPointer)
        view
        returns (StackPointer);
    using LibCast for function(InterpreterState memory, uint256, StackPointer)
        pure
        returns (StackPointer);
    using LibCast for function(InterpreterState memory, uint256, StackPointer)
        view
        returns (StackPointer)[];

    using AllStandardOps for function(
        IntegrityCheckState memory,
        Operand,
        StackPointer
    ) view returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1];
    using AllStandardOps for function(
        InterpreterState memory,
        Operand,
        StackPointer
    ) view returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1];

    using AllStandardOps for uint256[ALL_STANDARD_OPS_LENGTH + 1];

    using LibUint256Array for uint256[];
    using LibConvert for uint256[];
    using LibCast for uint256[];
    using LibCast for function(
        IntegrityCheckState memory,
        Operand,
        StackPointer
    ) view returns (StackPointer);
    using LibCast for function(
        IntegrityCheckState memory,
        Operand,
        StackPointer
    ) pure returns (StackPointer);
    using LibCast for function(
        IntegrityCheckState memory,
        Operand,
        StackPointer
    ) view returns (StackPointer)[];
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];

    /// An oddly specific conversion between a fixed and dynamic uint256 array.
    /// This is useful for the purpose of building metadata for bounds checks
    /// and dispatch of all the standard ops provided by RainInterpreter.
    /// The cast will fail if the length of the dynamic array doesn't match the
    /// first item of the fixed array; it relies on differences in memory
    /// layout in Solidity that MAY change in the future. The rollback guards
    /// against changes in Solidity memory layout silently breaking this cast.
    /// @param fixed_ The fixed size uint array to cast to a dynamic uint array.
    /// Specifically the size is fixed to match the number of standard ops.
    /// @param dynamic_ The dynamic uint array with length of the standard ops.
    function asUint256Array(
        function(IntegrityCheckState memory, Operand, StackPointer)
            view
            returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
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

    function asUint256Array(
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
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

    function integrityFunctionPointers(
        function(IntegrityCheckState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory locals_
    )
        internal
        pure
        returns (
            function(IntegrityCheckState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory
        )
    {
        unchecked {
            function(IntegrityCheckState memory, Operand, StackPointer)
                view
                returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
                memory pointersFixed_ = [
                    ALL_STANDARD_OPS_LENGTH.asIntegrityFunctionPointer(),
                    OpChainlinkOraclePrice.integrity,
                    OpCall.integrity,
                    OpContext.integrity,
                    OpContextRow.integrity,
                    OpDebug.integrity,
                    OpDoWhile.integrity,
                    OpFoldContext.integrity,
                    OpLoopN.integrity,
                    OpReadMemory.integrity,
                    OpSet.integrity,
                    OpHash.integrity,
                    OpERC20BalanceOf.integrity,
                    OpERC20TotalSupply.integrity,
                    OpERC20SnapshotBalanceOfAt.integrity,
                    OpERC20SnapshotTotalSupplyAt.integrity,
                    OpERC721BalanceOf.integrity,
                    OpERC721OwnerOf.integrity,
                    OpERC1155BalanceOf.integrity,
                    OpERC1155BalanceOfBatch.integrity,
                    OpEnsure.integrity,
                    OpBlockNumber.integrity,
                    OpTimestamp.integrity,
                    OpExplode32.integrity,
                    OpFixedPointScale18.integrity,
                    OpFixedPointScale18Div.integrity,
                    OpFixedPointScale18Mul.integrity,
                    OpFixedPointScaleBy.integrity,
                    OpFixedPointScaleN.integrity,
                    OpAny.integrity,
                    OpEagerIf.integrity,
                    OpEqualTo.integrity,
                    OpEvery.integrity,
                    OpGreaterThan.integrity,
                    OpIsZero.integrity,
                    OpLessThan.integrity,
                    OpSaturatingAdd.integrity,
                    OpSaturatingMul.integrity,
                    OpSaturatingSub.integrity,
                    OpAdd.integrity,
                    OpDiv.integrity,
                    OpExp.integrity,
                    OpMax.integrity,
                    OpMin.integrity,
                    OpMod.integrity,
                    OpMul.integrity,
                    OpSub.integrity,
                    OpIOrderBookV1VaultBalance.integrity,
                    OpISaleV2RemainingTokenInventory.integrity,
                    OpISaleV2Reserve.integrity,
                    OpISaleV2SaleStatus.integrity,
                    OpISaleV2Token.integrity,
                    OpISaleV2TotalReserveReceived.integrity,
                    OpIVerifyV1AccountStatusAtTime.integrity,
                    OpITierV2Report.integrity,
                    OpITierV2ReportTimeForTier.integrity,
                    OpSaturatingDiff.integrity,
                    OpSelectLte.integrity,
                    OpUpdateTimesForTierRange.integrity
                ];
            uint256[] memory pointers_ = pointersFixed_.asUint256Array();
            pointers_.extend(locals_.asUint256Array());
            return pointers_.asIntegrityPointers();
        }
    }

    function opcodeFunctionPointers(
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory locals_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory opcodeFunctionPointers_
        )
    {
        unchecked {
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
                memory pointersFixed_ = [
                    ALL_STANDARD_OPS_LENGTH.asOpFunctionPointer(),
                    OpChainlinkOraclePrice.price,
                    OpCall.run,
                    OpContext.run,
                    OpContextRow.run,
                    OpDebug.debug,
                    OpDoWhile.run,
                    OpFoldContext.run,
                    OpLoopN.run,
                    OpReadMemory.run,
                    OpSet.run,
                    OpHash.hash,
                    OpERC20BalanceOf.balanceOf,
                    OpERC20TotalSupply.totalSupply,
                    OpERC20SnapshotBalanceOfAt.balanceOfAt,
                    OpERC20SnapshotTotalSupplyAt.totalSupplyAt,
                    OpERC721BalanceOf.balanceOf,
                    OpERC721OwnerOf.ownerOf,
                    OpERC1155BalanceOf.balanceOf,
                    OpERC1155BalanceOfBatch.balanceOfBatch,
                    OpEnsure.ensure,
                    OpBlockNumber.blockNumber,
                    OpTimestamp.timestamp,
                    OpExplode32.explode32,
                    OpFixedPointScale18.scale18,
                    OpFixedPointScale18Div.scale18Div,
                    OpFixedPointScale18Mul.scale18Mul,
                    OpFixedPointScaleBy.scaleBy,
                    OpFixedPointScaleN.scaleN,
                    OpAny.any,
                    OpEagerIf.eagerIf,
                    OpEqualTo.equalTo,
                    OpEvery.every,
                    OpGreaterThan.greaterThan,
                    OpIsZero.isZero,
                    OpLessThan.lessThan,
                    OpSaturatingAdd.saturatingAdd,
                    OpSaturatingMul.saturatingMul,
                    OpSaturatingSub.saturatingSub,
                    OpAdd.add,
                    OpDiv.div,
                    OpExp.exp,
                    OpMax.max,
                    OpMin.min,
                    OpMod.mod,
                    OpMul.mul,
                    OpSub.sub,
                    OpIOrderBookV1VaultBalance.run,
                    OpISaleV2RemainingTokenInventory.run,
                    OpISaleV2Reserve.run,
                    OpISaleV2SaleStatus.run,
                    OpISaleV2Token.run,
                    OpISaleV2TotalReserveReceived.run,
                    OpIVerifyV1AccountStatusAtTime.run,
                    OpITierV2Report.report,
                    OpITierV2ReportTimeForTier.reportTimeForTier,
                    OpSaturatingDiff.saturatingDiff,
                    OpSelectLte.selectLte,
                    OpUpdateTimesForTierRange.updateTimesForTierRange
                ];
            uint256[] memory pointers_ = pointersFixed_.asUint256Array();
            pointers_.extend(locals_.asUint256Array());
            opcodeFunctionPointers_ = pointers_.asOpcodeFunctionPointers();
        }
    }
}
