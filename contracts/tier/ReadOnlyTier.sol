// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ITier } from "./ITier.sol";
import { TierUtil } from "./TierUtil.sol";

// ReadOnlyTier is abstract because it does not implement `report`.
abstract contract ReadOnlyTier is ITier {
    /**
     * Implements ITier.
     *
     * Always reverts because it is not possible to set a read only tier.
     */
    function setTier(
        address,
        Tier,
        bytes memory
    )
        external override
    {
        revert("ERR_READ_ONLY_TIER");
    }
}