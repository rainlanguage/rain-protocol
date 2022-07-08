// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {LibFnPtrs} from "../VMStateBuilder.sol";
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

import "hardhat/console.sol";

uint256 constant ALL_STANDARD_OPS_COUNT = 40;
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
        require(operand_ > 0, "0_OPERAND_NZON");
        return operand_;
    }

    function stackPopsFnPtrs() internal pure returns (bytes memory fnPtrs_) {
        unchecked {
            function(uint256) view returns (uint256)[ALL_STANDARD_OPS_LENGTH +
                1]
                memory fns_ = [
                    LibFnPtrs.toStackMoveFn(ALL_STANDARD_OPS_LENGTH * 0x20),
                    // opcode constant
                    zero,
                    // opcode stack
                    zero,
                    // opcode context
                    zero,
                    // opcode storage
                    zero,
                    // opcode zipmap (ignored)
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
                    nonzeroOperandN,
                    // eager if
                    three,
                    // equal to
                    two,
                    // every
                    nonzeroOperandN,
                    // greater than
                    two,
                    // iszero
                    one,
                    // less than
                    two,
                    // saturating add
                    nonzeroOperandN,
                    // saturating mul
                    nonzeroOperandN,
                    // saturating sub
                    nonzeroOperandN,
                    // add
                    nonzeroOperandN,
                    // div
                    nonzeroOperandN,
                    // exp
                    nonzeroOperandN,
                    // max
                    nonzeroOperandN,
                    // min
                    nonzeroOperandN,
                    // mod
                    nonzeroOperandN,
                    // mul
                    nonzeroOperandN,
                    // sub
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
                    two
                ];
            assembly {
                fnPtrs_ := fns_
            }
        }
    }

    function stackPushes(uint[] memory locals_) internal view returns (uint[] memory pushes_) {
        unchecked {
            uint localsLen_ = locals_.length;
            uint[ALL_STANDARD_OPS_LENGTH + 1] memory pushesFixed_ = [
                    ALL_STANDARD_OPS_LENGTH + localsLen_,
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
                    LibFnPtrs.asUint(nonzeroOperandN),
                    // block number
                    1,
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
            assembly {
                // hack to sneak in more allocated memory for the pushes array
                // before anything else can allocate.
                mstore(0x40, add(localsLen_, mload(0x40)))
                pushes_ := pushesFixed_
            }
            for (uint i_ = 0; i_ < localsLen_; i_++) {
                pushes_[i_ + ALL_STANDARD_OPS_LENGTH] = locals_[i_];
            }
        }
    }

    function fnPtrs() internal pure returns (bytes memory fnPtrs_) {
        unchecked {
            function(uint256, uint256)
                view
                returns (uint256)[ALL_STANDARD_OPS_LENGTH + 1]
                memory fns_ = [
                    LibFnPtrs.toOpFn(ALL_STANDARD_OPS_LENGTH * 0x20),
                    LibFnPtrs.toOpFn(0),
                    LibFnPtrs.toOpFn(0),
                    LibFnPtrs.toOpFn(0),
                    LibFnPtrs.toOpFn(0),
                    LibFnPtrs.toOpFn(0),
                    LibFnPtrs.toOpFn(0),
                    OpERC20BalanceOf.balanceOf,
                    OpERC20TotalSupply.totalSupply,
                    OpERC20SnapshotBalanceOfAt.balanceOfAt,
                    OpERC20SnapshotTotalSupplyAt.totalSupplyAt,
                    OpERC721BalanceOf.balanceOf,
                    OpERC721OwnerOf.ownerOf,
                    OpERC1155BalanceOf.balanceOf,
                    OpERC1155BalanceOfBatch.balanceOfBatch,
                    OpBlockNumber.blockNumber,
                    OpCaller.caller,
                    OpThisAddress.thisAddress,
                    OpTimestamp.timestamp,
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
                    OpITierV2Report.report,
                    OpITierV2ReportTimeForTier.reportTimeForTier,
                    OpSaturatingDiff.saturatingDiff,
                    OpSelectLte.selectLte,
                    OpUpdateTimesForTierRange.updateTimesForTierRange
                ];
            assembly {
                fnPtrs_ := fns_
            }
        }
    }
}
