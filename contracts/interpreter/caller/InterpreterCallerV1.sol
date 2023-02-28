// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../meta/IMetaV1.sol";
import "../../meta/LibMeta.sol";
import "./IInterpreterCallerV1.sol";
import "./LibCaller.sol";

struct InterpreterCallerV1ConstructionConfig {
    address deployer;
    bytes meta;
}

abstract contract InterpreterCallerV1 is IMetaV1, IInterpreterCallerV1 {
    constructor(
        bytes32 metaHash_,
        InterpreterCallerV1ConstructionConfig memory config_
    ) {
        LibMeta.checkMeta(metaHash_, config_.meta);
        emit Meta(msg.sender, config_.meta);
        LibCaller.touchDeployer(config_.deployer);
    }
}
