// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

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

abstract contract Phased {
    event PhaseShiftScheduled(uint32 indexed newPhaseBlock_);

    /// Solidity compiler should optimise this to 32 bytes as it has fixed size.
    uint32[8] public phaseBlocks = [uint32(-1), uint32(-1), uint32(-1), uint32(-1), uint32(-1), uint32(-1), uint32(-1), uint32(-1)];

    function phaseAtBlockNumber(uint32[8] memory phaseBlocks_, uint32 blockNumber_) public pure returns(Phase) {
        for(uint i_; i_<8; i_++) {
            if (blockNumber_ < phaseBlocks_[i_]) {
                return Phase(i_);
            }
        }
        return Phase(8);
    }

    function blockNumberForPhase(uint32[8] memory phaseBlocks_, Phase phase_) public pure returns(uint32) {
        if (phase_ == Phase.ZERO) {
            return 0;
        }
        else {
            return phaseBlocks_[uint(phase_) - 1];
        }
    }

    function currentPhase() public view returns (Phase) {
        return phaseAtBlockNumber(phaseBlocks, uint32(block.number));
    }

    modifier onlyPhase(Phase phase_) {
        require(currentPhase() == phase_, "BAD_PHASE");
        _;
    }

    modifier onlyAtLeastPhase(Phase phase_) {
        require(currentPhase() >= phase_, "MIN_PHASE");
        _;
    }

    function scheduleNextPhase(uint32 newPhaseBlock_) internal {
        require(uint32(block.number) <= newPhaseBlock_, "BLOCK_PAST");

        uint nextIndex_ = uint(currentPhase());
        require(uint32(-1) == phaseBlocks[nextIndex_], "DUPLICATE_SCHEDULE");
        phaseBlocks[nextIndex_] = newPhaseBlock_;

        emit PhaseShiftScheduled(newPhaseBlock_);
    }
}