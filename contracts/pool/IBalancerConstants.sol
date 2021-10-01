// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

// Mirrors all the constants from Balancer `configurable-rights-pool` repo.
// As we do not include balancer contracts as a dependency, we need to ensure
// that any calculations or values that cross the interface to their system are
// identical.
// solhint-disable-next-line max-line-length
// https://github.com/balancer-labs/configurable-rights-pool/blob/5bd63657ac71a9e5f8484ea561de572193b3317b/libraries/BalancerConstants.sol#L9
library IBalancerConstants {
    uint public constant BONE = 10**18;
    uint public constant MIN_WEIGHT = BONE;
    uint public constant MAX_WEIGHT = BONE * 50;
    uint public constant MAX_TOTAL_WEIGHT = BONE * 50;
    uint public constant MIN_BALANCE = BONE / 10**6;
    uint public constant MAX_BALANCE = BONE * 10**12;
    uint public constant MIN_POOL_SUPPLY = BONE * 100;
    uint public constant MAX_POOL_SUPPLY = BONE * 10**9;
    uint public constant MIN_FEE = BONE / 10**6;
    uint public constant MAX_FEE = BONE / 10;
    uint public constant EXIT_FEE = 0;
    uint public constant MAX_IN_RATIO = BONE / 2;
    uint public constant MAX_OUT_RATIO = (BONE / 3) + 1 wei;
    uint public constant MIN_ASSET_LIMIT = 2;
    uint public constant MAX_ASSET_LIMIT = 8;
    uint public constant MAX_UINT = uint(-1);
}