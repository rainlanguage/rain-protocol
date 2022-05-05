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
    function zero(uint256) internal pure returns (uint256) {
        return 0;
    }

    function one(uint) internal pure returns (uint) {
        return 1;
    }

    function two(uint) internal pure returns (uint) {
        return 2;
    }

    function three(uint) internal pure returns (uint) {
        return 3;
    }

    function nonzeroOperandN(uint operand_) internal pure returns (uint) {
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
            function(uint256)
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
                    // ierc20 balance of
                    two,
                    // ierc20 total supply
                    one,
                    // ierc721 balance of
                    two,
                    // ierc721 owner of
                    two,
                    // ierc1155 balance of
                    three,
                    // ierc1155 balance of batch
                    IERC1155Ops.stackPopsBalanceOfBatch
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
            function(uint256)
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
                    // ierc20 balance of
                    one,
                    // ierc20 total supply
                    one,
                    // ierc721 balance of
                    one,
                    // ierc721 owner of
                    one,
                    // ierc1155 balance of
                    one,
                    // ierc1155 balance of batch
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
