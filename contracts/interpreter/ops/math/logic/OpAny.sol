// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../deploy/LibIntegrity.sol";

/// @title OpAny
/// @notice Opcode to compare the top N stack values.
library OpAny {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        function(uint256[] memory) internal view returns (uint256) fn_;
        return
            integrityState_.applyFn(stackTop_, fn_, Operand.unwrap(operand_));
    }

    // ANY
    // ANY is the first nonzero item, else 0.
    // operand_ id the length of items to check.
    function any(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        StackTop bottom_ = stackTop_.down(Operand.unwrap(operand_));
        for (
            StackTop i_ = bottom_;
            StackTop.unwrap(i_) < StackTop.unwrap(stackTop_);
            i_ = i_.up()
        ) {
            uint256 item_ = i_.peekUp();
            if (item_ > 0) {
                return bottom_.push(item_);
            }
        }
        return bottom_.up();
    }
}
