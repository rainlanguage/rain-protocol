// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "sol.lib.memory/LibStackPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";
import "./OpEncode256.sol";

/// @title OpDecode256
/// @notice Opcode for decoding binary data from a 256 bit value that was encoded
/// with OpEncode256.
library OpDecode256 {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        Operand operand_,
        uint256 source_
    ) internal pure returns (uint256) {
        unchecked {
            uint256 startBit_ = (Operand.unwrap(operand_) >> 8) & MASK_8BIT;
            uint256 length_ = Operand.unwrap(operand_) & MASK_8BIT;

            // Build a bitmask of desired length. Max length is uint8 max which
            // is 255. A 256 length doesn't really make sense as that isn't an
            // encoding anyway, it's just the source_ verbatim.
            uint256 mask_ = (2 ** length_ - 1);

            return (source_ >> startBit_) & mask_;
        }
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        unchecked {
            uint256 startBit_ = (Operand.unwrap(operand_) >> 8) & MASK_8BIT;
            uint256 length_ = Operand.unwrap(operand_) & MASK_8BIT;

            if (startBit_ + length_ > 256) {
                revert TruncatedEncoding(startBit_, length_);
            }
            return integrityCheckState_.applyFn(stackTop_, f);
        }
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f, operand_);
    }
}
