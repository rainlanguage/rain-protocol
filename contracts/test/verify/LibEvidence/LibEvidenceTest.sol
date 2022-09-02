// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../verify/LibEvidence.sol";

/// @title LibEvidenceTest
/// Thin wrapper around `LibEvidence` library exposing functions for testing
contract LibEvidenceTest {
    function updateEvidenceRefsAndReturnEvidencesFromRefs(
        Evidence[] memory evidences_
    ) external pure returns (Evidence[] memory) {
        uint256[] memory refs_ = new uint256[](evidences_.length);
        uint256 refsIndex_ = 0;

        for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
            LibEvidence._updateEvidenceRef(refs_, evidences_[i_], refsIndex_);
            refsIndex_++;
        }

        return LibEvidence.asEvidences(refs_);
    }

    function updateEvidenceRefAndReturnEvidenceFromRef(
        Evidence memory evidence_
    ) external pure returns (Evidence memory) {
        uint256[] memory refs_ = new uint256[](1);
        uint256 refsIndex_ = 0;

        LibEvidence._updateEvidenceRef(refs_, evidence_, refsIndex_);
        refsIndex_++;

        return LibEvidence.asEvidences(refs_)[0];
    }
}
