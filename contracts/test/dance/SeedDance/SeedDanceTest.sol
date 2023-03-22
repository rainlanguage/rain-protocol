// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {SeedDance, Seed, Commitment, TimeBound, Secret} from "../../../dance/SeedDance.sol";

/// @title SeedDanceTest
/// Thin wrapper around the `SeedDance` contract to expose internal functions
/// for testing
contract SeedDanceTest is SeedDance {
    function start(Seed initialSeed_) external {
        _start(initialSeed_);
    }

    function commit(Commitment commitment_) external {
        _commit(commitment_);
    }

    function reveal(TimeBound memory timeBound_, Secret secret_) external {
        _reveal(timeBound_, secret_);
    }
}
