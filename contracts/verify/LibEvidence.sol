// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// Structure of arbitrary evidence to support any action taken.
/// Privileged roles are expected to provide evidence just as applicants as an
/// audit trail will be preserved permanently in the logs.
/// @param account The account this evidence is relevant to.
/// @param data Arbitrary bytes representing evidence. MAY be e.g. a reference
/// to a sufficiently decentralised external system such as an IPFS hash.
struct Evidence {
    address account;
    bytes data;
}

library LibEvidence {
    function _updateEvidenceRef(
        uint256[] memory refs_,
        Evidence memory evidence_,
        uint256 refsIndex_
    ) internal pure {
        assembly ("memory-safe") {
            mstore(add(refs_, add(0x20, mul(0x20, refsIndex_))), evidence_)
        }
    }

    function asEvidences(
        uint256[] memory refs_
    ) internal pure returns (Evidence[] memory evidences_) {
        assembly ("memory-safe") {
            evidences_ := refs_
        }
    }
}
