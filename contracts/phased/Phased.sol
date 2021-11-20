// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

/// Defines all possible phases.
/// `Phased` begins in `Phase.ZERO` and moves through each phase sequentially.
enum Phase {
    ZERO,
    ONE,
    TWO,
    THREE,
    FOUR,
    FIVE,
    SIX,
    SEVEN,
    EIGHT
}

/// @title Phased
/// @notice `Phased` is an abstract contract that defines up to `9` phases that
/// an implementing contract moves through.
///
/// `Phase.ZERO` is always the first phase and does not, and cannot, be set
/// expicitly. Effectively it is implied that `Phase.ZERO` has been active
/// since block zero.
///
/// Each subsequent phase `Phase.ONE` through `Phase.EIGHT` must be
/// scheduled sequentially and explicitly at a block number.
///
/// Only the immediate next phase can be scheduled with `scheduleNextPhase`,
/// it is not possible to schedule multiple phases ahead.
///
/// Multiple phases can be scheduled in a single block if each scheduled phase
/// is scheduled for the current block.
///
/// Several utility functions and modifiers are provided.
///
/// A single hook `_beforeScheduleNextPhase` is provided so contracts can
/// implement additional phase shift checks.
///
/// One event `PhaseShiftScheduled` is emitted each time a phase shift is
/// scheduled (not when the scheduled phase is reached).
///
/// @dev `Phased` contracts have a defined timeline with available
/// functionality grouped into phases.
/// Every `Phased` contract starts at `Phase.ZERO` and moves sequentially
/// through phases `ONE` to `EIGHT`.
/// Every `Phase` other than `Phase.ZERO` is optional, there is no requirement
/// that all 9 phases are implemented.
/// Phases can never be revisited, the inheriting contract always moves through
/// each achieved phase linearly.
/// This is enforced by only allowing `scheduleNextPhase` to be called once per
/// phase.
/// It is possible to call `scheduleNextPhase` several times in a single block
/// but the `block.number` for each phase must be reached each time to schedule
/// the next phase.
/// Importantly there are events and several modifiers and checks available to
/// ensure that functionality is limited to the current phase.
/// The full history of each phase shift block is recorded as a fixed size
/// array of `uint32`.
abstract contract Phased {
    /// Every phase block starts uninitialized.
    /// Only uninitialized blocks can be set by the phase scheduler.
    uint32 public constant UNINITIALIZED = 0xFFFFFFFF;

    /// `PhaseShiftScheduled` is emitted when the next phase is scheduled.
    event PhaseShiftScheduled(uint32 indexed newPhaseBlock_);

    /// 8 phases each as 32 bits to fit a single 32 byte word.
    uint32[8] public phaseBlocks;

    constructor() {
        for (uint256 i_ = 0; i_ < 8; i_++) {
            phaseBlocks[i_] = UNINITIALIZED;
        }
    }

    /// Pure function to reduce an array of phase blocks and block number to a
    /// specific `Phase`.
    /// The phase will be the highest attained even if several phases have the
    /// same block number.
    /// If every phase block is after the block number then `Phase.ZERO` is
    /// returned.
    /// If every phase block is before the block number then `Phase.EIGHT` is
    /// returned.
    /// @param phaseBlocks_ Fixed array of phase blocks to compare against.
    /// @param blockNumber_ Determine the relevant phase relative to this block
    /// number.
    /// @return The "current" phase relative to the block number and phase
    /// blocks list.
    function phaseAtBlockNumber(
        uint32[8] memory phaseBlocks_,
        uint32 blockNumber_
    )
        public
        pure
        returns(Phase)
    {
        for(uint i_ = 0; i_<8; i_++) {
            if (blockNumber_ < phaseBlocks_[i_]) {
                return Phase(i_);
            }
        }
        return Phase(8);
    }

    /// Pure function to reduce an array of phase blocks and phase to a
    /// specific block number.
    /// `Phase.ZERO` will always return block `0`.
    /// Every other phase will map to a block number in `phaseBlocks_`.
    /// @param phaseBlocks_ Fixed array of phase blocks to compare against.
    /// @param phase_ Determine the relevant block number for this phase.
    /// @return The block number for the phase according to the phase blocks
    ///         list, as uint32.
    function blockNumberForPhase(uint32[8] calldata phaseBlocks_, Phase phase_)
        external
        pure
        returns(uint32)
    {
        return phase_ > Phase.ZERO ? phaseBlocks_[uint(phase_) - 1] : 0;
    }

    /// Impure read-only function to return the "current" phase from internal
    /// contract state.
    /// Simply wraps `phaseAtBlockNumber` for current values of `phaseBlocks`
    /// and `block.number`.
    function currentPhase() public view returns (Phase) {
        return phaseAtBlockNumber(phaseBlocks, uint32(block.number));
    }

    /// Modifies functions to only be callable in a specific phase.
    /// @param phase_ Modified functions can only be called during this phase.
    modifier onlyPhase(Phase phase_) {
        require(currentPhase() == phase_, "BAD_PHASE");
        _;
    }

    /// Modifies functions to only be callable in a specific phase OR if the
    /// specified phase has passed.
    /// @param phase_ Modified function only callable during or after this
    /// phase.
    modifier onlyAtLeastPhase(Phase phase_) {
        require(currentPhase() >= phase_, "MIN_PHASE");
        _;
    }

    /// Writes the block for the next phase.
    /// Only uninitialized blocks can be written to.
    /// Only the immediate next phase relative to `currentPhase` can be written
    /// to.
    /// Emits `PhaseShiftScheduled` with the next phase block.
    /// @param nextPhaseBlock_ The block for the next phase.
    function scheduleNextPhase(uint32 nextPhaseBlock_) internal {
        require(uint32(block.number) <= nextPhaseBlock_, "NEXT_BLOCK_PAST");
        require(nextPhaseBlock_ < UNINITIALIZED, "NEXT_BLOCK_UNINITIALIZED");

        // The next index is the current phase because `Phase.ZERO` doesn't
        // exist as an index.
        uint nextIndex_ = uint(currentPhase());
        require(UNINITIALIZED == phaseBlocks[nextIndex_], "NEXT_BLOCK_SET");

        _beforeScheduleNextPhase(nextPhaseBlock_);
        phaseBlocks[nextIndex_] = nextPhaseBlock_;

        emit PhaseShiftScheduled(nextPhaseBlock_);
    }

    /// Hook called before scheduling the next phase.
    /// Useful to apply additional constraints or state changes on a phase
    /// change.
    /// Note this is called when scheduling the phase change, not on the block
    /// the phase change occurs.
    /// This is called before the phase change so that all functionality that
    /// is behind a phase gate is still available at the moment of applying the
    /// hook for scheduling the next phase.
    /// @param nextPhaseBlock_ The block for the next phase.
    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_)
        internal
        virtual
    { } //solhint-disable-line no-empty-blocks
}