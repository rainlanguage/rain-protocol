// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { ITier } from "./ITier.sol";

/// @title ValueTier
///
/// A contract that is `ValueTier` expects to derive tiers from explicit values.
/// For example an address must send or hold an amount of something to reach a given tier.
/// Anything with predefined values that map to tiers can be a `ValueTier`.
contract ValueTier {
    uint256[8] public tierValues;

    constructor(uint256[8] memory tierValues_) public {
        tierValues = tierValues_;
    }

    function tierToValue(ITier.Tier tier_) internal view returns(uint256) {
        if (uint256(tier_) > 0) {
            return tierValues[uint256(tier_) - 1];
        } else {
            return 0;
        }
    }

    function valueToTier(uint256 value_) internal view returns(ITier.Tier) {
        for (uint256 i = 0; i < 8; i++) {
            if (value_ < tierValues[i]) {
                return ITier.Tier(i);
            }
        }
        return ITier.Tier.EIGHT;
    }
}