// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { Trust, TrustConfig } from "./Trust.sol";

contract TrustFactory is Factory {
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (TrustConfig memory config_) = abi.decode(data_, (TrustConfig));
        return address(new Trust(config_));
    }
}