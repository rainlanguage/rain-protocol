// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "rain.interpreter/abstract/DeployerDiscoverableMetaV1.sol";
import "rain.interpreter/lib/caller/LibDeployerDiscoverable.sol";

contract IInterpreterCallerConsumer is DeployerDiscoverableMetaV1 {
    constructor(
        bytes memory meta_,
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) DeployerDiscoverableMetaV1(keccak256(meta_), config_) {}

    function deployTouchExpression(address deployer_) external {
        LibDeployerDiscoverable.touchDeployer(deployer_);
    }

    function checkMeta(
        bytes memory expectedHash_,
        bytes memory meta_
    ) external pure returns (bool) {
        LibMeta.checkMetaHashed(keccak256(expectedHash_), meta_);
        return true;
    }

    function checkIsRainMetaV1(
        bytes memory meta_
    ) external pure returns (bool) {
        return LibMeta.isRainMetaV1(meta_);
    }
}
