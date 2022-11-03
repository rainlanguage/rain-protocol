// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {Cooldown} from "../../cooldown/Cooldown.sol";

// import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title CooldownTest
///
/// Wrapper around Cooldown for testing.
contract CooldownTest is Cooldown {
    /// Sample value to implement cooldown on setter
    uint256 internal value;

    /// Initialzes the Cooldown Contract
    function initialize(uint256 cooldownDuration_) external {
        initializeCooldown(cooldownDuration_);
    }

    /// Get the current set cooldown duration
    function getCooldownDuration() external view returns (uint256) {
        return cooldownDuration;
    }

    /// Setter function to update the value onlyAfterCooldown
    function setValue(uint256 value_) external onlyAfterCooldown {
        value = value_;
    }

    /// Getter function to get the value
    function getValue() external view returns (uint256) {
        return value;
    }
}
