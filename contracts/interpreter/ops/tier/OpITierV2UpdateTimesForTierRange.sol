// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "../../../tier/libraries/TierReport.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

library OpUpdateTimesForTierRange {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        Operand operand_,
        uint256 report_,
        uint256 timestamp_
    ) internal pure returns (uint256) {
        return
            TierReport.updateTimesForTierRange(
                report_,
                // start tier.
                // 4 low bits.
                Operand.unwrap(operand_) & 0x0f,
                // end tier.
                // 4 high bits.
                (Operand.unwrap(operand_) >> 4) & 0x0f,
                timestamp_
            );
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    // Stacks a report with updated times over tier range.
    // The start and end tier are taken from the low and high bits of
    // the `operand_` respectively.
    // The report to update and timestamp to update to are both
    // taken from the stack.
    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f, operand_);
    }
}
