// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../deploy/IExpressionDeployerV1.sol";
import "./IInterpreterV1.sol";

struct EvaluableConfig {
    IExpressionDeployerV1 deployer;
    IInterpreterV1 interpreter;
    IInterpreterStoreV1 store;
    ExpressionConfig expressionConfig;
}

struct Evaluable {
    IInterpreterV1 interpreter;
    IInterpreterStoreV1 store;
    address expression;
}

library LibEvaluable {
    function hash(Evaluable memory evaluable_) internal pure returns (bytes32) {
        bytes32(keccak256(abi.encode(evaluable_)));
    }
}
