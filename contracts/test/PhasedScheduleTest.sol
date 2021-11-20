// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Phase, Phased } from "../phased/Phased.sol";

/// @title PhasedScheduleTest
/// Contract for testing phase hook functionality.
contract PhasedScheduleTest is Phased {
    /// Exposes `scheduleNextPhase` for testing.
    /// @param nextPhaseBlock_ As per `scheduleNestPhase`.
    function testScheduleNextPhase(uint32 nextPhaseBlock_) external {
        scheduleNextPhase(nextPhaseBlock_);
    }

    function succeedsOnlyPhaseZero() internal onlyPhase(Phase.ZERO)
    { } // solhint-disable-line no-empty-blocks

    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_)
        internal
        virtual
        override
    {
        succeedsOnlyPhaseZero();
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        succeedsOnlyPhaseZero(); // can run phase-dependent logic anywhere
    }
}