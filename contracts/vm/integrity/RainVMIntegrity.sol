// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;
import "../runtime/RainVM.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../../sstore2/SSTORE2.sol";
import "../runtime/LibStackTop.sol";
import "./LibIntegrityState.sol";
import "./IRainVMIntegrity.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

abstract contract RainVMIntegrity is IRainVMIntegrity {
    using SafeCast for uint256;
    using Math for uint256;
    using LibVMState for VMState;
    using LibCast for uint256;
    using LibStackTop for bytes;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        );

    function ensureIntegrity(
        StorageOpcodesRange memory storageOpcodesRange_,
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256[] memory finalStacks_
    ) external view returns (uint256 stackLength_, uint256 scratch_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_,
            storageOpcodesRange_,
            constantsLength_,
            0,
            StackTop.wrap(0),
            StackTop.wrap(0),
            0,
            integrityFunctionPointers()
        );
        for (uint256 i_ = 0; i_ < finalStacks_.length; i_++) {
            _ensureIntegrity(
                integrityState_,
                SourceIndex.wrap(i_),
                StackTop.wrap(0),
                finalStacks_[i_]
            );
        }
        return (
            integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop),
            integrityState_.scratch
        );
    }

    function _ensureIntegrity(
        IntegrityState memory integrityState_,
        SourceIndex sourceIndex_,
        StackTop stackTop_,
        uint256 minimumFinalStackIndex_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            assembly ("memory-safe") {
                cursor_ := mload(
                    add(mload(integrityState_), add(0x20, mul(0x20, sourceIndex_)))
                )
                end_ := add(cursor_, mload(cursor_))
            }

            // Loop until complete.
            while (cursor_ < end_) {
                uint256 opcode_;
                Operand operand_;
                cursor_ += 2;
                {
                    assembly ("memory-safe") {
                        let op_ := and(mload(cursor_), 0xFFFF)
                        operand_ := and(op_, 0xFF)
                        opcode_ := shr(8, op_)
                    }
                }
                // We index into the function pointers here to ensure that any
                // opcodes that we don't have a pointer for will error.
                stackTop_ = integrityState_.integrityFunctionPointers[opcode_](
                    integrityState_,
                    operand_,
                    stackTop_
                );
            }
            require(
                minimumFinalStackIndex_ <=
                    integrityState_.stackBottom.toIndex(stackTop_),
                "MIN_FINAL_STACK"
            );
            return stackTop_;
        }
    }
}
