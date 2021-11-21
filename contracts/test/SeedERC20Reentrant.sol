// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ReserveToken } from "./ReserveToken.sol";
import { SeedERC20, ERC20 } from "../seed/SeedERC20.sol";

/// @title SeedERC20Reentrant
/// Test contract that attempts to call reentrant code on `SeedERC20`.
/// The calls MUST fail when driven by the test harness.
contract SeedERC20Reentrant is ReserveToken {
    SeedERC20 private seedERC20Contract;

    enum Method {
        UNINITIALIZED,
        SEED,
        UNSEED,
        REDEEM
    }

    Method public methodTarget;

    /// Set the contract to attempt to reenter.
    /// @param seedERC20Contract_ Seed contract to reeenter.
    function addReentrantTarget(SeedERC20 seedERC20Contract_) external {
        seedERC20Contract = seedERC20Contract_;
    }

    /// Set the method to attempt to reenter.
    /// @param methodTarget_ Method to attempt to reenter.
    function setMethodTarget(Method methodTarget_) external {
        methodTarget = methodTarget_;
    }

    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (
            methodTarget == Method.SEED
            && receiver_ == address(seedERC20Contract)
        ) {
            // This call MUST fail.
            seedERC20Contract.seed(0, 1);
        } else if (
            methodTarget == Method.UNSEED
            && sender_ == address(seedERC20Contract)
        ) {
            // This call MUST fail.
            seedERC20Contract.unseed(1);
        } else if (
            methodTarget == Method.REDEEM
            && sender_ == address(seedERC20Contract)
        ) {
            // This call MUST fail.
            seedERC20Contract.redeem(1);
        }
    }
}
