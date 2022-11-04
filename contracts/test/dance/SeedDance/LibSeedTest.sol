// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {LibSeed, Seed} from "../../../dance/SeedDance.sol";

/// @title LibSeedTest
/// Thin wrapper around the `LibSeed` library
contract LibSeedTest {
    function with(
        Seed seed_,
        uint256 val_
    ) external pure returns (Seed newSeed_) {
        newSeed_ = LibSeed.with(seed_, val_);
    }
}
