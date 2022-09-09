// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierwiseCombine.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../deploy/LibIntegrity.sol";

library OpSaturatingDiff {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFn(stackTop_, TierwiseCombine.saturatingSub);
    }

    // Stack the tierwise saturating subtraction of two reports.
    // If the older report is newer than newer report the result will
    // be `0`, else a tierwise diff in blocks will be obtained.
    // The older and newer report are taken from the stack.
    function saturatingDiff(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(TierwiseCombine.saturatingSub);
    }
}
