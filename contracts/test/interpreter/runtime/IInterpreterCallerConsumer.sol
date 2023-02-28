// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../interpreter/caller/InterpreterCallerV1.sol";

contract IInterpreterCallerConsumer is InterpreterCallerV1 {
    constructor(
        bytes memory metaHash_,
        InterpreterCallerV1ConstructionConfig memory interpreterCallerConfig_
    ) InterpreterCallerV1(keccak256(metaHash_), interpreterCallerConfig_) {}

    function deployTouchExpression(address deployer_) external {
        LibCaller.touchDeployer(deployer_);
    }

    function checkMeta(
        bytes memory expectedHash_,
        bytes memory meta_
    ) external pure returns (bool) {
        LibMeta.checkMeta(keccak256(expectedHash_), meta_);
        return true;
    }

    function checkIsRainMetaV1(
        bytes memory meta_
    ) external pure returns (bool) {
        return LibMeta.isRainMetaV1(meta_);
    }
}
