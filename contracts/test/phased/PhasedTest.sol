// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Phased} from "../../phased/Phased.sol";

/// @title PhasedTest
/// Empty contract for tests enumerating behaviour of the `Phased` modifiers.
contract PhasedTest is Phased {
    bool public condition = true;

    constructor() {
        initializePhased();
    }

    /// Exposes `schedulePhase` for testing.
    /// @param timestamp_ As per `schedulePhase`.
    function testScheduleNextPhase(uint256 timestamp_) external {
        require(condition, "CONDITION");
        schedulePhase(currentPhase() + 1, timestamp_);
    }

    /// This function wraps `onlyPhase` modifier, passing phase directly into
    /// modifier argument.
    /// @param phase_ Modifier MUST error if current phase is not `phase_`.
    /// @return Always true if not error.
    function runsOnlyPhase(
        uint256 phase_
    ) external view onlyPhase(phase_) returns (bool) {
        return true;
    }

    /// This function wraps `onlyAtLeastPhase` modifier, passing phase directly
    /// into modifier argument.
    /// @param phase_ Modifier MUST error if current phase is not AT LEAST
    /// `phase_`.
    /// @return Always true if not error.
    function runsOnlyAtLeastPhase(
        uint256 phase_
    ) external view onlyAtLeastPhase(phase_) returns (bool) {
        return true;
    }

    /// Toggles `condition` for testing phase scheduling hook.
    function toggleCondition() external {
        condition = !condition;
    }
}
