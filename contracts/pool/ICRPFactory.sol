// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import { PoolParams } from "./IConfigurableRightsPool.sol";
import { Rights } from "./IRightsManager.sol";

/// Mirrors the Balancer `CRPFactory` functions relevant to
/// bootstrapping a pool. This is the minimal interface required for
/// `RedeemableERC20Pool` to function, much of the Balancer contract is elided
/// intentionally. Clients should use Balancer code directly.
// solhint-disable-next-line max-line-length
/// https://github.com/balancer-labs/configurable-rights-pool/blob/5bd63657ac71a9e5f8484ea561de572193b3317b/contracts/CRPFactory.sol#L27
interface ICRPFactory {
    // solhint-disable-next-line max-line-length
    // https://github.com/balancer-labs/configurable-rights-pool/blob/5bd63657ac71a9e5f8484ea561de572193b3317b/contracts/CRPFactory.sol#L50
    function newCrp(
        address factoryAddress,
        PoolParams calldata poolParams,
        Rights calldata rights
    )
    external
    returns (address);
}