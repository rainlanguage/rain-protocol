// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierReport.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../integrity/LibIntegrityState.sol";

library OpUpdateTimesForTierRange {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _updateTimesForTierRange(
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
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _updateTimesForTierRange);
    }

    // Stacks a report with updated times over tier range.
    // The start and end tier are taken from the low and high bits of
    // the `operand_` respectively.
    // The report to update and timestamp to update to are both
    // taken from the stack.
    function updateTimesForTierRange(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_updateTimesForTierRange, operand_);
    }
}
