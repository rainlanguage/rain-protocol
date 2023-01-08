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
import "./core/OpGet.sol";
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

/// Thrown when a dynamic length array is NOT 1 more than a fixed length array.
/// Should never happen outside a major breaking change to memory layouts.
error BadDynamicLength(uint256 dynamicLength, uint256 standardOpsLength);

/// @dev Number of ops currently provided by `AllStandardOps`.
uint256 constant ALL_STANDARD_OPS_LENGTH = 59;

/// @title AllStandardOps
/// @notice Every opcode available from the core repository laid out as a single
/// array to easily build function pointers for `IInterpreterV1`.
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

    /// An oddly specific length conversion between a fixed and dynamic `uint256`
    /// array. This is useful for the purpose of building metadata for bounds
    /// checks and dispatch of all the standard ops provided by `Rainterpreter`.
    /// The cast will fail if the length of the dynamic array doesn't match the
    /// first item of the fixed array; it relies on differences in memory
    /// layout in Solidity that MAY change in the future. The rollback guards
    /// against changes in Solidity memory layout silently breaking this cast.
    /// @param fixed_ The fixed size `uint256` array to cast to a dynamic
    /// `uint256` array. Specifically the size is fixed to match the number of
    /// standard ops.
    /// @param dynamic_ The dynamic `uint256` array with length of the standard
    /// ops.
    function asUint256Array(
        function(IntegrityCheckState memory, Operand, StackPointer)
            view
            returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
            memory fixed_
    ) internal pure returns (uint256[] memory dynamic_) {
        assembly ("memory-safe") {
            dynamic_ := fixed_
        }
        if (dynamic_.length != ALL_STANDARD_OPS_LENGTH) {
            revert BadDynamicLength(dynamic_.length, ALL_STANDARD_OPS_LENGTH);
        }
    }

    /// An oddly specific conversion between a fixed and dynamic `uint256` array.
    /// This is useful for the purpose of building function pointers for the
    /// runtime dispatch of all the standard ops provided by `Rainterpreter`.
    /// The cast will fail if the length of the dynamic array doesn't match the
    /// first item of the fixed array; it relies on differences in memory
    /// layout in Solidity that MAY change in the future. The rollback guards
    /// against changes in Solidity memory layout silently breaking this cast.
    /// @param fixed_ The fixed size `uint256` array to cast to a dynamic
    /// `uint256` array. Specifically the size is fixed to match the number of
    /// standard ops.
    /// @param dynamic_ The dynamic `uint256` array with length of the standard
    /// ops.
    function asUint256Array(
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[ALL_STANDARD_OPS_LENGTH + 1]
            memory fixed_
    ) internal pure returns (uint256[] memory dynamic_) {
        assembly ("memory-safe") {
            dynamic_ := fixed_
        }
        if (dynamic_.length != ALL_STANDARD_OPS_LENGTH) {
            revert BadDynamicLength(dynamic_.length, ALL_STANDARD_OPS_LENGTH);
        }
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
                    OpGet.integrity,
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
                    OpChainlinkOraclePrice.run,
                    OpCall.run,
                    OpContext.run,
                    OpContextRow.run,
                    OpDebug.run,
                    OpDoWhile.run,
                    OpFoldContext.run,
                    OpGet.run,
                    OpLoopN.run,
                    OpReadMemory.run,
                    OpSet.run,
                    OpHash.run,
                    OpERC20BalanceOf.run,
                    OpERC20TotalSupply.run,
                    OpERC20SnapshotBalanceOfAt.run,
                    OpERC20SnapshotTotalSupplyAt.run,
                    OpERC721BalanceOf.run,
                    OpERC721OwnerOf.run,
                    OpERC1155BalanceOf.run,
                    OpERC1155BalanceOfBatch.run,
                    OpEnsure.run,
                    OpBlockNumber.run,
                    OpTimestamp.run,
                    OpExplode32.run,
                    OpFixedPointScale18.run,
                    OpFixedPointScale18Div.run,
                    OpFixedPointScale18Mul.run,
                    OpFixedPointScaleBy.run,
                    OpFixedPointScaleN.run,
                    OpAny.run,
                    OpEagerIf.run,
                    OpEqualTo.run,
                    OpEvery.run,
                    OpGreaterThan.run,
                    OpIsZero.run,
                    OpLessThan.run,
                    OpSaturatingAdd.run,
                    OpSaturatingMul.run,
                    OpSaturatingSub.run,
                    OpAdd.run,
                    OpDiv.run,
                    OpExp.run,
                    OpMax.run,
                    OpMin.run,
                    OpMod.run,
                    OpMul.run,
                    OpSub.run,
                    OpIOrderBookV1VaultBalance.run,
                    OpISaleV2RemainingTokenInventory.run,
                    OpISaleV2Reserve.run,
                    OpISaleV2SaleStatus.run,
                    OpISaleV2Token.run,
                    OpISaleV2TotalReserveReceived.run,
                    OpIVerifyV1AccountStatusAtTime.run,
                    OpITierV2Report.run,
                    OpITierV2ReportTimeForTier.run,
                    OpSaturatingDiff.run,
                    OpSelectLte.run,
                    OpUpdateTimesForTierRange.run
                ];
            uint256[] memory pointers_ = pointersFixed_.asUint256Array();
            pointers_.extend(locals_.asUint256Array());
            opcodeFunctionPointers_ = pointers_.asOpcodeFunctionPointers();
        }
    }
}
