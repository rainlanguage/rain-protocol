// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../deploy/IExpressionDeployerV1.sol";
import "./IInterpreterV1.sol";

struct EvaluableConfig {
    IExpressionDeployerV1 deployer;
    bytes[] sources;
    uint256[] constants;
}

/// Struct over the return of `IExpressionDeployerV1.deployExpression` which adds
/// which may be more convenient to work with than raw addresses.
struct Evaluable {
    IInterpreterV1 interpreter;
    IInterpreterStoreV1 store;
    address expression;
}

library LibEvaluable {
    function hash(Evaluable memory evaluable_) internal pure returns (bytes32) {
        return keccak256(abi.encode(evaluable_));
    }
}
