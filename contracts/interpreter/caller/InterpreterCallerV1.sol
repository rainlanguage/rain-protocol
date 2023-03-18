// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "sol.metadata/IMetaV1.sol";
import "sol.metadata/LibMeta.sol";
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
        LibMeta.checkMetaHashed(metaHash_, config_.meta);
        emit MetaV1(msg.sender, config_.meta);
        LibCaller.touchDeployer(config_.deployer);
    }
}
