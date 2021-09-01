// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import { Factory } from "../Factory.sol";
import { KYC } from "./KYC.sol";

contract KYCFactory is Factory {
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (address admin_) = abi.decode(data_, (address));
        KYC kyc_ = new KYC(admin_);
        return address(kyc_);
    }

    function createChild(address admin_) external returns(address) {
        return this.createChild(abi.encode(admin_));
    }
}