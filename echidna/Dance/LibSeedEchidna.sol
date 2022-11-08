// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {LibSeed, Seed} from "../../contracts/dance/SeedDance.sol";

/// @title LibSeedEchidna
/// Wrapper around the `LibSeed` library for echidna fuzz testing.
contract LibSeedEchidna {
    // Test the `LibSeed.with()` function evaluating the outputs from differents `val_` inputs.
    function WithDiffInputs(
        Seed seedOrigin,
        uint256 val1_,
        uint256 val2_
    ) external pure {
        require(val1_ != val2_, "SAME_INPUTS");

        Seed newSeed1 = LibSeed.with(seedOrigin, val1_);
        Seed newSeed2 = LibSeed.with(seedOrigin, val2_);

        // Origin seed should not generate an equal output seed
        assert(Seed.unwrap(seedOrigin) != Seed.unwrap(newSeed1));
        assert(Seed.unwrap(seedOrigin) != Seed.unwrap(newSeed2));

        // Same seed and but different val should NOT generate the same output
        assert(Seed.unwrap(newSeed1) != Seed.unwrap(newSeed2));
    }

    // Test the `LibSeed.with()` function checking the deterministic outputs from same seed and val.
    function WithDeterministic(Seed seedOrigin, uint256 val_) external pure {
        Seed newSeed1 = LibSeed.with(seedOrigin, val_);

        //  Output seed should not be equal to origin seed
        assert(Seed.unwrap(newSeed1) != Seed.unwrap(seedOrigin));

        Seed newSeed2 = LibSeed.with(seedOrigin, val_);

        // Same seed and val should generate the same output everytime
        assert(Seed.unwrap(newSeed1) == Seed.unwrap(newSeed2));
    }
}
