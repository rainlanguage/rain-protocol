// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import { PoolParams } from "./IConfigurableRightsPool.sol";
import { Rights } from "./IRightsManager.sol";

interface ICRPFactory {
    function newCrp(
        address factoryAddress,
        PoolParams calldata poolParams,
        Rights calldata rights
    )
    external
    returns (address);
}