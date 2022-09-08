// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../integrity/LibIntegrity.sol";

/// @title OpEagerIf
/// @notice Opcode for selecting a value based on a condition.
library OpEagerIf {
    using LibIntegrity for IntegrityState;
    using LibStackTop for StackTop;

    function _eagerIf(
        uint256 a_,
        uint256[] memory bs_,
        uint256[] memory cs_
    ) internal pure returns (uint256[] memory) {
        return a_ > 0 ? bs_ : cs_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFn(
                stackTop_,
                _eagerIf,
                Operand.unwrap(operand_) + 1
            );
    }

    /// Eager because BOTH x_ and y_ must be eagerly evaluated
    /// before EAGER_IF will select one of them. If both x_ and y_
    /// are cheap (e.g. constant values) then this may also be the
    /// simplest and cheapest way to select one of them.
    function eagerIf(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            return stackTop_.applyFn(_eagerIf, Operand.unwrap(operand_) + 1);
        }
    }
}
