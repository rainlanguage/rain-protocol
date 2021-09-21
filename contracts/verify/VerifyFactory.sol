// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import { Factory } from "../factory/Factory.sol";
import { Verify } from "./Verify.sol";

contract VerifyFactory is Factory {
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (address admin_) = abi.decode(data_, (address));
        Verify verify_ = new Verify(admin_);
        return address(verify_);
    }

    function createChild(address admin_) external returns(address) {
        return this.createChild(abi.encode(admin_));
    }
}