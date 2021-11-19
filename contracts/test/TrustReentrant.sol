// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ReserveToken, ERC20 } from "./ReserveToken.sol";
import { Trust } from "../trust/Trust.sol";

/// @title TrustReentrant
/// Test contract that attempts to call reentrant code on `Trust`.
/// The calls MUST fail when driven by the test harness.
contract TrustReentrant is ReserveToken {
    Trust private trustContract;

    /// Set the contract to attempt to reenter.
    /// @param trustContract_ Trust to reenter.
    function addReentrantTarget(Trust trustContract_) external {
        trustContract = trustContract_;
    }

    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (sender_ != address(0) && sender_ == address(trustContract)) {
            // This call MUST fail.
            trustContract.anonEndDistribution();
        }
    }
}
