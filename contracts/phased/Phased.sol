// SPDX-License-Identifier: CAL
pragma solidity ^0.8.4;

error BadPhase();

/// @title Phased
/// @notice `Phased` is an abstract contract that defines up to `9` phases that
/// an implementing contract moves through.
///
/// Phase `0` is always the first phase and does not, and cannot, be set
/// expicitly. Effectively it is implied that phase `0` has been active
/// since block zero.
///
/// Each subsequent phase `1` through `8` must be scheduled sequentially and
/// explicitly at a block timestamp.
///
/// Only the immediate next phase can be scheduled with `scheduleNextPhase`,
/// it is not possible to schedule multiple phases ahead.
///
/// Multiple phases can be scheduled in a single second if each scheduled phase
/// is scheduled for the current block OR the contract is operating on a chain
/// with sub-second block times. I.e. if uniqueness of block timestamps is NOT
/// enforced by a chain then phases scheduling can share a timstamp across
/// multiple transactions. To enforce uniqueness of timestamps across
/// transactions on subsecond blockchains, simply schedule the final phase
/// shift of a transaction in the future.
///
/// Several utility functions and modifiers are provided.
///
/// One event `PhaseShiftScheduled` is emitted each time a phase shift is
/// scheduled (not when the scheduled phase is reached).
///
/// @dev `Phased` contracts have a defined timeline with available
/// functionality grouped into phases.
/// Every `Phased` contract starts at `0` and moves sequentially
/// through phases `1` to `8`.
/// Every `Phase` other than `0` is optional, there is no requirement
/// that all 9 phases are implemented.
/// Phases can never be revisited, the inheriting contract always moves through
/// each achieved phase linearly.
/// This is enforced by only allowing `scheduleNextPhase` to be called once per
/// phase.
/// It is possible to call `scheduleNextPhase` several times in a single second
/// but the `block.timestamp` for each phase must be reached each time to
/// schedule the next phase.
/// Importantly there are events and several modifiers and checks available to
/// ensure that functionality is limited to the current phase.
/// The full history of each phase shift block is recorded as a fixed size
/// array of `uint32`.
contract Phased {
    /// @dev Every phase block starts uninitialized.
    /// Only uninitialized blocks can be set by the phase scheduler.
    uint32 private constant UNINITIALIZED = type(uint32).max;
    /// @dev This is how many phases can fit in a `uint256`.
    uint256 private constant MAX_PHASE = 8;

    /// `PhaseScheduled` is emitted when the next phase is scheduled.
    /// @param sender `msg.sender` that scheduled the next phase.
    /// @param newPhase The next phase being scheduled.
    /// @param scheduledTime The timestamp the phase will be achieved.
    event PhaseScheduled(
        address sender,
        uint256 newPhase,
        uint256 scheduledTime
    );

    /// 8 phases each as 32 bits to fit a single 32 byte word.
    uint32[MAX_PHASE] public phaseTimes;

    /// Initialize the blocks at "never".
    /// All phase blocks are initialized to `UNINITIALIZED`.
    /// i.e. not fallback solidity value of `0`.
    function initializePhased() internal {
        // Reinitialization is a bug.
        // Only need to check the first block as all times are about to be set
        // to `UNINITIALIZED`.
        assert(phaseTimes[0] < 1);
        uint32[MAX_PHASE] memory phaseTimes_ = [
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED,
            UNINITIALIZED
        ];
        phaseTimes = phaseTimes_;
        // 0 is always the timestamp for implied phase 0.
        emit PhaseScheduled(msg.sender, 0, 0);
    }

    /// Pure function to reduce an array of phase times and block timestamp to
    /// a specific `Phase`.
    /// The phase will be the highest attained even if several phases have the
    /// same timestamp.
    /// If every phase block is after the timestamp then `0` is returned.
    /// If every phase block is before the timestamp then `MAX_PHASE` is
    /// returned.
    /// @param phaseTimes_ Fixed array of phase times to compare against.
    /// @param timestamp_ Determine the relevant phase relative to this time.
    /// @return phase_ The "current" phase relative to the timestamp and phase
    /// times list.
    function phaseAtTime(
        uint32[MAX_PHASE] memory phaseTimes_,
        uint256 timestamp_
    ) public pure returns (uint256 phase_) {
        for (phase_ = 0; phase_ < MAX_PHASE; phase_++) {
            if (timestamp_ < phaseTimes_[phase_]) {
                break;
            }
        }
    }

    /// Pure function to reduce an array of phase times and phase to a
    /// specific timestamp.
    /// `Phase.ZERO` will always return block `0`.
    /// Every other phase will map to a time in `phaseTimes_`.
    /// @param phaseTimes_ Fixed array of phase blocks to compare against.
    /// @param phase_ Determine the relevant block number for this phase.
    /// @return timestamp_ The timestamp for the phase according to
    /// `phaseTimes_`.
    function timeForPhase(
        uint32[MAX_PHASE] memory phaseTimes_,
        uint256 phase_
    ) public pure returns (uint256 timestamp_) {
        timestamp_ = phase_ > 0 ? phaseTimes_[phase_ - 1] : 0;
    }

    /// Impure read-only function to return the "current" phase from internal
    /// contract state.
    /// Simply wraps `phaseAtTime` for current values of `phaseTimes`
    /// and `block.timestamp`.
    function currentPhase() public view returns (uint256 phase_) {
        phase_ = phaseAtTime(phaseTimes, block.timestamp);
    }

    /// Modifies functions to only be callable in a specific phase.
    /// @param phase_ Modified functions can only be called during this phase.
    modifier onlyPhase(uint256 phase_) {
        if (currentPhase() != phase_) {
            revert BadPhase();
        }
        _;
    }

    /// Modifies function to NOT be callable in a specific phase.
    /// @param phase_ Modified functions can be called in any phase except this.
    modifier onlyNotPhase(uint256 phase_) {
        if (currentPhase() == phase_) {
            revert BadPhase();
        }
        _;
    }

    /// Modifies functions to only be callable in a specific phase OR if the
    /// specified phase has passed.
    /// @param phase_ Modified function only callable during or after this
    /// phase.
    modifier onlyAtLeastPhase(uint256 phase_) {
        require(currentPhase() >= phase_, "MIN_PHASE");
        _;
    }

    /// Writes the timestamp for the next phase.
    /// Only uninitialized times can be written to.
    /// Only the immediate next phase relative to `currentPhase` can be written
    /// to. It is still required to specify the `phase_` so that it is explicit
    /// and clear in the calling code which phase is being moved to.
    /// Emits `PhaseShiftScheduled` with the phase timestamp.
    /// @param phase_ The phase being scheduled.
    /// @param timestamp_ The timestamp for the phase.
    function schedulePhase(uint256 phase_, uint256 timestamp_) internal {
        require(block.timestamp <= timestamp_, "NEXT_TIME_PAST");
        require(timestamp_ < UNINITIALIZED, "NEXT_TIME_UNINITIALIZED");
        // Don't need to check for underflow as the index will be used as a
        // fixed array index below. Implies that scheduling phase `0` is NOT
        // supported.
        uint256 index_;
        unchecked {
            index_ = phase_ - 1;
        }
        // Bit of a hack to check the current phase against the index to
        // save calculating the subtraction twice.
        require(currentPhase() == index_, "NEXT_PHASE");

        require(UNINITIALIZED == phaseTimes[index_], "NEXT_TIME_SET");

        // Cannot exceed UNINITIALIZED (see above) so don't need to check
        // overflow on downcast.
        unchecked {
            phaseTimes[index_] = uint32(timestamp_);
        }

        emit PhaseScheduled(msg.sender, phase_, timestamp_);
    }
}
