// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Phase, Phased} from "../../phased/Phased.sol";

/// @title PhasedScheduleTest
/// Contract for testing phase hook functionality.
contract PhasedScheduleTest is Phased {
    constructor() {
        initializePhased();
    }

    /// Exposes `scheduleNextPhase` for testing.
    /// @param nextPhaseBlock_ As per `scheduleNestPhase`.
    function testScheduleNextPhase(uint256 nextPhaseBlock_) external {
        scheduleNextPhase(nextPhaseBlock_);
    }

    // solhint-disable-next-line no-empty-blocks
    function succeedsOnlyPhaseZero() internal onlyPhase(Phase.ZERO) {}

    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint256 nextPhaseBlock_)
        internal
        virtual
        override
    {
        succeedsOnlyPhaseZero();
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        succeedsOnlyPhaseZero(); // can run phase-dependent logic anywhere
    }
}
