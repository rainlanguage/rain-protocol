// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {LibCommitment, Commitment, Secret} from "../../contracts/dance/SeedDance.sol";

/// @title LibCommitmentEchidna
/// Wrapper around the `LibCommitment` library for echidna fuzz testing.
contract LibCommitmentEchidna {
    // Fuzz testing against `eq()` function
    function Eq(uint256 a_, uint256 b_) external pure {
        bool result = LibCommitment.eq(
            Commitment.wrap(a_),
            Commitment.wrap(b_)
        );

        bool resultExpected = a_ == b_;

        assert(result == resultExpected);
    }

    // Fuzz testing against `fromSecret()` function
    function FromSecret(uint256 a_) external pure {
        Secret input = Secret.wrap(a_);

        Commitment result = LibCommitment.fromSecret(input);

        uint256 resultExpected = uint256(keccak256(abi.encodePacked(a_)));

        assert(Commitment.unwrap(result) == resultExpected);
    }

    // Fuzz testing against `nil()` function
    function Nil() external pure {
        Commitment result = LibCommitment.nil();

        assert(Commitment.unwrap(result) == 0);
    }
}
