// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {LibCommitment, Commitment, Secret} from "../../../dance/SeedDance.sol";

/// @title LibCommitmentTest
/// Thin wrapper around the `LibCommitment` library
contract LibCommitmentTest {
    function eq(Commitment a_, Commitment b_) external pure returns (bool eq_) {
        eq_ = LibCommitment.eq(a_, b_);
    }

    function fromSecret(
        Secret secret_
    ) external pure returns (Commitment commitment_) {
        commitment_ = LibCommitment.fromSecret(secret_);
    }

    function nil() external pure returns (Commitment nil_) {
        nil_ = LibCommitment.nil();
    }
}
