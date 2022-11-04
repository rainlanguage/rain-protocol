// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {TierV2} from "../../../tier/TierV2.sol";
import {ITierV2} from "../../../tier/ITierV2.sol";
import {TierConstants} from "../../../tier/libraries/TierConstants.sol";

/// @title TierV2Test
///
/// Very simple TierV2 implementation for testing.
contract TierV2Test is TierV2 {
    constructor() {
        _disableInitializers();
    }

    /// Either fetch the report from storage or return UNINITIALIZED.
    /// @inheritdoc ITierV2
    function report(
        address,
        uint256[] memory
    ) public view virtual override returns (uint256) {
        return TierConstants.NEVER_REPORT;
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address,
        uint256,
        uint256[] calldata
    ) external view returns (uint256) {
        return block.timestamp;
    }
}
