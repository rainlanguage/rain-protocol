// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IERC1820RegistryUpgradeable as IERC1820Registry} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC1820RegistryUpgradeable.sol";

/// @dev https://eips.ethereum.org/EIPS/eip-1820#single-use-registry-deployment-account
IERC1820Registry constant IERC1820_REGISTRY = IERC1820Registry(
    0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
);

string constant IERC1820_NAME_IEXPRESSION_DEPLOYER_V1 = "IExpressionDeployerV1";
