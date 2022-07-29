// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../runtime/LibStackTop.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpEagerIf
/// @notice Opcode for selecting a value based on a condition.
library OpEagerIf {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;

    function _eagerIf(uint a_, uint b_, uint c_) internal pure returns (uint) {
        return a_ > 0 ? b_ : c_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _eagerIf);
    }

    /// Eager because BOTH x_ and y_ must be eagerly evaluated
    /// before EAGER_IF will select one of them. If both x_ and y_
    /// are cheap (e.g. constant values) then this may also be the
    /// simplest and cheapest way to select one of them.
    function eagerIf(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_eagerIf);
    }
}
