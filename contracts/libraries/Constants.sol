// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.12;

/**
 * @author Terra Virtua
 * @title Put all the constants in one place
 */

import "../configurable-rights-pool/libraries/BalancerConstants.sol";

library Constants {
    uint256 constant ONE = 10 ** 18;
    uint256 constant HEADROOM = 10 ** 18;

    // These are the addresses that Balancer has deployed to on the network being used.
    address constant BFactory = 0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd;
    address constant CRPFactory = 0xed52D8E202401645eDAD1c0AA21e872498ce47D0;
    address constant RightsManager = 0x0F811b1AF2B6B447B008eFF31eCceeE5A0b1d842;
}
