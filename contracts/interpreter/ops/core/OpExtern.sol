// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "sol.lib.binmaskflag/Binary.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "./OpReadMemory.sol";
import "rain.interpreter/lib/extern/LibExtern.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.solmem/lib/LibUint256Array.sol";
import "rain.solmem/lib/LibPointer.sol";

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
        IntegrityCheckState memory integrityCheckState,
        Operand operand,
        Pointer stackTop
    ) internal pure returns (Pointer) {
        uint256 inputs = Operand.unwrap(operand) & MASK_5BIT;
        uint256 outputs = (Operand.unwrap(operand) >> 5) & MASK_5BIT;
        uint256 offset = Operand.unwrap(operand) >> 10;

        if (offset >= integrityCheckState.constantsLength) {
            revert OutOfBoundsConstantsRead(
                integrityCheckState.constantsLength,
                offset
            );
        }

        return
            integrityCheckState.push(
                integrityCheckState.pop(stackTop, inputs),
                outputs
            );
    }

    function intern(
        InterpreterState memory interpreterState,
        Operand operand,
        Pointer stackTop
    ) internal view returns (Pointer) {
        IInterpreterExternV1 interpreterExtern;
        ExternDispatch externDispatch;
        uint256 head;
        uint256[] memory tail;
        {
            uint256 inputs = Operand.unwrap(operand) & MASK_5BIT;
            uint256 offset = (Operand.unwrap(operand) >> 10);

            // Mirrors constant opcode.
            EncodedExternDispatch encodedDispatch;
            assembly ("memory-safe") {
                encodedDispatch := mload(
                    add(mload(add(interpreterState, 0x20)), mul(0x20, offset))
                )
            }

            (interpreterExtern, externDispatch) = LibExtern.decodeExternCall(
                encodedDispatch
            );
            (head, tail) = stackTop.unsafeList(inputs);
            unchecked {
                stackTop = stackTop.unsafeSubWords(inputs + 1).unsafePush(
                    head
                );
            }
        }

        {
            uint256 outputs = (Operand.unwrap(operand) >> 5) & MASK_5BIT;

            uint256[] memory results = interpreterExtern.extern(
                externDispatch,
                tail
            );

            if (results.length != outputs) {
                revert BadExternResultsLength(outputs, results.length);
            }

            LibMemCpy.unsafeCopyWordsTo(
                results.dataPointer(),
                stackTop,
                results.length
            );
            stackTop = stackTop.unsafeAddWords(results.length);
        }

        return stackTop;
    }
}
