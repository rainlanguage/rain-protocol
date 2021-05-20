// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.12;

/**
 * @author Terra Virtua
 * @title Put all the constants in one place
 */

library Constants {
    // Same as BalancerConstants.ONE
    uint256 public constant ONE = 10 ** 18;
    // Balancer weights can get stuck if combined weights need to exceed 50 during a transaction.
    // This is the minimum headroom we give ourselves to prevent this happening.
    uint256 public constant POOL_HEADROOM = 10 ** 18;
}
