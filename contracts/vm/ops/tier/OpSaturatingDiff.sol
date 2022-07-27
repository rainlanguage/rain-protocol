// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/libraries/TierwiseCombine.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

library OpSaturatingDiff {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    // Stack the tierwise saturating subtraction of two reports.
    // If the older report is newer than newer report the result will
    // be `0`, else a tierwise diff in blocks will be obtained.
    // The older and newer report are taken from the stack.
    function saturatingDiff(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 newerReport_,
            uint256 olderReport_
        ) = stackTop_.popAndPeek();
        location_.set(
            TierwiseCombine.saturatingSub(newerReport_, olderReport_)
        );
        return stackTopAfter_;
    }
}
