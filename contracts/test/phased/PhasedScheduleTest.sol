// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {Phased} from "../../phased/Phased.sol";

/// @title PhasedScheduleTest
/// Contract for testing phase hook functionality.
contract PhasedScheduleTest is Phased {
    constructor() {
        initializePhased();
    }

    /// Exposes `schedulePhase` for testing.
    function testScheduleNextPhase() external {
        uint256 initialPhase_ = currentPhase();

        succeedsOnlyPhase(initialPhase_);
        schedulePhase(initialPhase_ + 1, block.timestamp);
        succeedsOnlyPhase(initialPhase_ + 1);
    }

    /// Exposes `onlyPhase` for testing.
    /// @param phase_ As per `onlyPhase`.
    function succeedsOnlyPhase(uint256 phase_) internal onlyPhase(phase_) {}
}
