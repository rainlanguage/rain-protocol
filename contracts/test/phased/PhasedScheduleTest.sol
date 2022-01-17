// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Phased} from "../../phased/Phased.sol";

/// @title PhasedScheduleTest
/// Contract for testing phase hook functionality.
contract PhasedScheduleTest is Phased {
    uint private constant PHASE_ONE = 1;

    constructor() {
        initializePhased();
    }

    /// Exposes `schedulePhase` for testing.
    /// @param phaseBlock_ As per `schedulePhase`.
    function testScheduleNextPhase(uint256 phaseBlock_) external {
        succeedsOnlyPhaseOne();
        schedulePhase(currentPhase() + 1, phaseBlock_);
        succeedsOnlyPhaseOne();
    }

    // solhint-disable-next-line no-empty-blocks
    function succeedsOnlyPhaseOne() internal onlyPhase(PHASE_ONE) {}

}
