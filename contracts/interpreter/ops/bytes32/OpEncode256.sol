// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.lib.interpreter/LibOp.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";
import "sol.lib.binmaskflag/Binary.sol";

/// Thrown during integrity check when the encoding is truncated due to the end
/// bit being over 256.
/// @param startBit The start of the OOB encoding.
/// @param length The length of the OOB encoding.
error TruncatedEncoding(uint256 startBit, uint256 length);

/// @title OpEncode256
/// @notice Opcode for encoding binary data into a 256 bit value.
library OpEncode256 {
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        Operand operand_,
        uint256 source_,
        uint256 target_
    ) internal pure returns (uint256) {
        unchecked {
            uint256 startBit_ = (Operand.unwrap(operand_) >> 8) & MASK_8BIT;
            uint256 length_ = Operand.unwrap(operand_) & MASK_8BIT;

            // Build a bitmask of desired length. Max length is uint8 max which
            // is 255. A 256 length doesn't really make sense as that isn't an
            // encoding anyway, it's just the source_ verbatim.
            uint256 mask_ = (2 ** length_ - 1);

            return
                // Punch a mask sized hole in target.
                (target_ & ~(mask_ << startBit_)) |
                // Fill the hole with masked bytes from source.
                ((source_ & mask_) << startBit_);
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
