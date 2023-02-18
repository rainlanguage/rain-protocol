// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IInterpreterCallerV1.sol";
import "./LibCallerMeta.sol";

struct InterpreterCallerV1ConstructionConfig {
    bytes callerMeta;
    address deployer;
}

abstract contract InterpreterCallerV1 is IInterpreterCallerV1 {
    constructor(
        bytes32 metaHash_,
        InterpreterCallerV1ConstructionConfig memory config_
    ) {
        LibCallerMeta.checkCallerMeta(metaHash_, config_.callerMeta);
        emit InterpreterCallerMeta(msg.sender, config_.callerMeta);
        LibCallerMeta.touchDeployer(config_.deployer);
    }
}
