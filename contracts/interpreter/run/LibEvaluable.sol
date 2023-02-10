// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../deploy/IExpressionDeployerV1.sol";
import "./IInterpreterV1.sol";

struct EvaluableConfig {
    IExpressionDeployerV1 deployer;
    ExpressionConfig expressionConfig;
}

library LibEvaluable {
    function hash(Evaluable memory evaluable_) internal pure returns (bytes32) {
        return keccak256(abi.encode(evaluable_));
    }
}
