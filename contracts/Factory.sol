// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { IFactory } from "./IFactory.sol";

abstract contract Factory is IFactory {
    mapping(address => bool) internal contracts;

    function _createChild(bytes calldata data_) internal virtual returns(address) { }

    function createChild(bytes calldata data_) external virtual override returns(address) {
        address child_ = _createChild(data_);
        contracts[child_] = true;
        emit IFactory.NewContract(msg.sender, child_);
        return child_;
    }

    function isChild(address maybeChild_) external virtual override returns(bool) {
        return contracts[maybeChild_];
    }
}