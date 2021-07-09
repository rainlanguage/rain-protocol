// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ReserveToken } from "./ReserveToken.sol";
import { Trust } from "../Trust.sol";

/// @title TrustReentrant
/// Test contract that attempts to call reentrant code on `Trust`.
/// The calls MUST fail when driven by the test harness.
contract TrustReentrant is ReserveToken {
    Trust private trustContract;

    function addReentrantTarget(Trust trustContract_) external {
        trustContract = trustContract_;
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (sender_ != address(0) && sender_ == address(trustContract)) {
            // This call MUST fail.
            trustContract.anonEndRaise();
        }
    }
}
