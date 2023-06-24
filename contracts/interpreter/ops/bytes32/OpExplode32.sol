// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpExplode
/// @notice Opcode for exploding a single value into 8x 32 bit integers.
library OpExplode32 {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.push(integrityCheckState_.pop(stackTop_), 8);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer stackTopAfter_) {
        (Pointer location_, uint256 i_) = stackTop_.unsafePop();
        uint256 mask_ = uint256(type(uint32).max);
        assembly ("memory-safe") {
            mstore(location_, and(i_, mask_))
            mstore(add(location_, 0x20), and(mask_, shr(0x20, i_)))
            mstore(add(location_, 0x40), and(mask_, shr(0x40, i_)))
            mstore(add(location_, 0x60), and(mask_, shr(0x60, i_)))
            mstore(add(location_, 0x80), and(mask_, shr(0x80, i_)))
            mstore(add(location_, 0xA0), and(mask_, shr(0xA0, i_)))
            mstore(add(location_, 0xC0), and(mask_, shr(0xC0, i_)))
            mstore(add(location_, 0xE0), shr(0xE0, i_))
            stackTopAfter_ := add(location_, 0x100)
        }
    }
}
