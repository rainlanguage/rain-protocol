// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { SeedERC20 } from "../SeedERC20.sol";

/// @title SeedERC20ForceSendEther
/// Test contract that can selfdestruct and forcibly send ether to the target address.
contract SeedERC20ForceSendEther {
    /// Destroy and send current ether balance to SeedERC20 contract address.
    /// @param seedERC20Contract_ Seed contract to send current ether balance to.
    function destroy(SeedERC20 seedERC20Contract_) external {
        address payable victimAddress = payable(address(seedERC20Contract_));
        selfdestruct(victimAddress);
    }

    fallback () external payable {
    }
}
