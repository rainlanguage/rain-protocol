// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.solmem/lib/LibPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// Thrown when a stack read index is outside the current stack top.
error OutOfBoundsStackRead(int256 stackTopIndex, uint256 stackRead);

/// Thrown when a constant read index is outside the constants array.
error OutOfBoundsConstantsRead(uint256 constantsLength, uint256 constantsRead);

/// @dev Read a value from the stack.
uint256 constant OPERAND_MEMORY_TYPE_STACK = 0;
/// @dev Read a value from the constants.
uint256 constant OPERAND_MEMORY_TYPE_CONSTANT = 1;

/// @title OpReadMemory
/// @notice Opcode for stacking from the interpreter state in memory. This can
/// either be copying values from anywhere in the stack or from the constants
/// array by index.
library OpReadMemory {
    using LibPointer for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using Math for uint256;

    function integrity(
        IntegrityCheckState memory integrityCheckState,
        Operand operand,
        Pointer stackTop
    ) internal pure returns (Pointer) {
        uint256 typ = Operand.unwrap(operand) & MASK_1BIT;
        uint256 offset = Operand.unwrap(operand) >> 1;
        if (typ == OPERAND_MEMORY_TYPE_STACK) {
            int256 stackTopIndex = integrityCheckState
                .stackBottom
                .toIndexSigned(stackTop);
            if (stackTopIndex < 0 || offset >= uint256(stackTopIndex)) {
                revert OutOfBoundsStackRead(stackTopIndex, offset);
            }

            // Ensure that highwater is moved past any stack item that we
            // read so that copied values cannot later be consumed.
            integrityCheckState.stackHighwater = Pointer.wrap(
                Pointer.unwrap(integrityCheckState.stackHighwater).max(
                    Pointer.unwrap(
                        integrityCheckState.stackBottom.unsafeAddWords(offset)
                    )
                )
            );
        } else {
            if (offset >= integrityCheckState.constantsLength) {
                revert OutOfBoundsConstantsRead(
                    integrityCheckState.constantsLength,
                    offset
                );
            }
        }
        return integrityCheckState.push(stackTop);
    }

    function run(
        InterpreterState memory state,
        Operand operand,
        Pointer stackTop
    ) internal pure returns (Pointer) {
        unchecked {
            uint256 typ = Operand.unwrap(operand) & MASK_1BIT;
            uint256 offset = Operand.unwrap(operand) >> 1;
            assembly ("memory-safe") {
                mstore(
                    stackTop,
                    mload(
                        add(
                            mload(add(state, mul(0x20, typ))),
                            mul(0x20, offset)
                        )
                    )
                )
            }
            return Pointer.wrap(Pointer.unwrap(stackTop) + 0x20);
        }
    }
}
