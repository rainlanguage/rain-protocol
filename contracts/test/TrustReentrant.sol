// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ReserveToken } from "./ReserveToken.sol";
import { Trust } from "../Trust.sol";

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
            trustContract.anonEndRaise(); // reentrant call
        }
    }
}
