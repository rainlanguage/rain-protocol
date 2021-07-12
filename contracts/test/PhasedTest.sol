// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { Phase, Phased } from "../Phased.sol";

/// Empty contract for tests enumerating behaviour of the modifiers.
contract PhasedTest is Phased {
    /// Custom variable for testing _beforeScheduleNextPhase hook
    bool public hookCondition = true;

    function testScheduleNextPhase(uint32 nextPhaseBlock_) external {
        scheduleNextPhase(nextPhaseBlock_);
    }

    /// This function wraps `onlyPhase` modifier, passing phase directly into modifier argument.
    /// Returns true only if current phase matches phase passed in.
    function runsOnlyPhase(Phase phase_) external view onlyPhase(phase_) returns(bool)
    {
        return true;
    }

    /// This function wraps `onlyAtLeastPhase` modifier, passing phase directly into modifier argument.
    /// Returns true only if current phase is equal to or greater than phase passed in.
    function runsOnlyAtLeastPhase(Phase phase_) external view onlyAtLeastPhase(phase_) returns(bool)
    {
        return true;
    }

    /// Custom function for testing _beforeScheduleNextPhase hook
    /// Toggles the hook condition
    function toggleHookCondition() external {
        hookCondition = !hookCondition;
    }

    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_) internal virtual override {
        require(hookCondition, "HOOK_CONDITION");
        super._beforeScheduleNextPhase(nextPhaseBlock_);
    }
}