// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { IFactory } from "./IFactory.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

abstract contract Factory is IFactory, ReentrancyGuard {
    mapping(address => bool) private contracts;

    function _createChild(bytes calldata data_) internal virtual returns(address) { }

    function createChild(bytes calldata data_) external virtual override nonReentrant returns(address) {
        address child_ = _createChild(data_);
        contracts[child_] = true;
        emit IFactory.NewContract(msg.sender, child_);
        return child_;
    }

    function isChild(address maybeChild_) external virtual override returns(bool) {
        return contracts[maybeChild_];
    }
}