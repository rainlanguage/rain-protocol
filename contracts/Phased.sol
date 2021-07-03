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

    uint256 public phaseBlocks = uint256(-1);

    function phaseAtBlockNumber(uint256 phaseBlocks_, uint32 blockNumber_) public pure returns(Phase) {
        for(uint256 i_; i_<8; i_++) {
            if (blockNumber_ < uint32(uint256(phaseBlocks_ >> (i_ * 32)))) {
                return Phase(i_);
            }
        }
        return Phase(8);
    }

    function blockNumberForPhase(uint256 phaseBlocks_, Phase phase_) public pure returns(uint32) {
        return uint32(uint256(phaseBlocks_ >> (uint256(phase_) * 32)));
    }

    function updatePhaseBlocks(uint256 phaseBlocks_, Phase phase_, uint32 blockNumber_) public pure returns (uint256) {
        require(phase_ > Phase.ZERO, "UPDATE_PHASE_ZERO");
        return(phaseBlocks_ & ~(uint256(uint32(-1))) << (uint256(phase_) - 1)) | (uint256(blockNumber_) << (uint256(phase_) - 1));
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

        Phase nextPhase_ = Phase(uint8(currentPhase()) + 1);
        require(uint32(-1) == blockNumberForPhase(phaseBlocks, nextPhase_), "DUPLICATE_SCHEDULE");

        phaseBlocks = updatePhaseBlocks(phaseBlocks, nextPhase_, newPhaseBlock_);

        emit PhaseShiftScheduled(newPhaseBlock_);
    }
}