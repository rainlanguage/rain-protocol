// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.binmaskflag/Binary.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "./OpReadMemory.sol";
import "../../extern/LibExtern.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "sol.lib.memory/LibPointer.sol";

/// Thrown when the length of results from an extern don't match what the operand
/// defines. This is bad because it implies our integrity check miscalculated the
/// stack which is undefined behaviour.
/// @param expected The length we expected based on the operand.
/// @param actual The length that was returned from the extern.
error BadExternResultsLength(uint256 expected, uint256 actual);

library OpExtern {
    using LibIntegrityCheck for IntegrityCheckState;
    using LibStackPointer for Pointer;
    using LibPointer for Pointer;
    using LibUint256Array for uint256[];

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        uint256 inputs_ = Operand.unwrap(operand_) & MASK_5BIT;
        uint256 outputs_ = (Operand.unwrap(operand_) >> 5) & MASK_5BIT;
        uint256 offset_ = Operand.unwrap(operand_) >> 10;

        if (offset_ >= integrityCheckState_.constantsLength) {
            revert OutOfBoundsConstantsRead(
                integrityCheckState_.constantsLength,
                offset_
            );
        }

        return
            integrityCheckState_.push(
                integrityCheckState_.pop(stackTop_, inputs_),
                outputs_
            );
    }

    function intern(
        InterpreterState memory interpreterState_,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        IInterpreterExternV1 interpreterExtern_;
        ExternDispatch externDispatch_;
        uint256 head_;
        uint256[] memory tail_;
        {
            uint256 inputs_ = Operand.unwrap(operand_) & MASK_5BIT;
            uint256 offset_ = (Operand.unwrap(operand_) >> 10);

            // Mirrors constant opcode.
            EncodedExternDispatch encodedDispatch_;
            assembly ("memory-safe") {
                encodedDispatch_ := mload(
                    add(mload(add(interpreterState_, 0x20)), mul(0x20, offset_))
                )
            }

            (interpreterExtern_, externDispatch_) = LibExtern.decode(
                encodedDispatch_
            );
            (head_, tail_) = stackTop_.unsafeList(inputs_);
            unchecked {
                stackTop_ = stackTop_.unsafeSubWords(inputs_ + 1).unsafePush(
                    head_
                );
            }
        }

        {
            uint256 outputs_ = (Operand.unwrap(operand_) >> 5) & MASK_5BIT;

            uint256[] memory results_ = interpreterExtern_.extern(
                externDispatch_,
                tail_
            );

            if (results_.length != outputs_) {
                revert BadExternResultsLength(outputs_, results_.length);
            }

            LibMemCpy.unsafeCopyWordsTo(
                results_.dataPointer(),
                stackTop_,
                results_.length
            );
            stackTop_ = stackTop_.unsafeAddWords(results_.length);
        }

        return stackTop_;
    }
}
