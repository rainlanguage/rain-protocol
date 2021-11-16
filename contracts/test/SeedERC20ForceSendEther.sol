// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { SeedERC20 } from "../seed/SeedERC20.sol";

/// @title SeedERC20ForceSendEther
/// Test contract that can selfdestruct and forcibly send ether to the target
/// address.
/// None of this should do anything as `SeedERC20` deals only with erc20
/// tokens.
contract SeedERC20ForceSendEther {
    /// Destroy and send current ether balance to `SeedERC20` contract address.
    /// @param seedERC20Contract_ Seed contract to send current ether balance
    /// to.
    function destroy(SeedERC20 seedERC20Contract_) external {
        address payable victimAddress = payable(address(seedERC20Contract_));
        selfdestruct(victimAddress);
    }

    fallback () external payable { } //solhint-disable-line no-empty-blocks

    receive () external payable { } //solhint-disable-line no-empty-blocks
}
