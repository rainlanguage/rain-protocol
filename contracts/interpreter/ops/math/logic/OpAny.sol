// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "sol.lib.memory/LibStackPointer.sol";
import "sol.lib.memory/LibPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "rain.lib.interpreter/LibOp.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpAny
/// @notice Opcode to compare the top N stack values.
library OpAny {
    using LibPointer for Pointer;
    using LibStackPointer for Pointer;
    using LibOp for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        function(uint256[] memory) internal view returns (uint256) fn_;
        return
            integrityCheckState_.applyFn(
                stackTop_,
                fn_,
                Operand.unwrap(operand_)
            );
    }

    // ANY
    // ANY is the first nonzero item, else 0.
    // operand_ id the length of items to check.
    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        Pointer bottom_ = stackTop_.unsafeSubWords(Operand.unwrap(operand_));
        for (
            Pointer i_ = bottom_;
            Pointer.unwrap(i_) < Pointer.unwrap(stackTop_);
            i_ = i_.unsafeAddWord()
        ) {
            uint256 item_ = i_.unsafeReadWord();
            if (item_ > 0) {
                return bottom_.unsafePush(item_);
            }
        }
        return bottom_.unsafeAddWord();
    }
}
