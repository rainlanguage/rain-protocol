// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Phased} from "../../phased/Phased.sol";

/// @title PhasedScheduleTest
/// Contract for testing phase hook functionality.
contract PhasedScheduleTest is Phased {
    uint private constant PHASE_ZERO = 0;

    constructor() {
        initializePhased();
    }

    /// Exposes `schedulePhase` for testing.
    /// @param phaseBlock_ As per `schedulePhase`.
    function testScheduleNextPhase(uint256 phaseBlock_) external {
        succeedsOnlyPhaseZero();
        schedulePhase(currentPhase() + 1, phaseBlock_);
        succeedsOnlyPhaseZero();
    }

    // solhint-disable-next-line no-empty-blocks
    function succeedsOnlyPhaseZero() internal onlyPhase(PHASE_ZERO) {}

}
