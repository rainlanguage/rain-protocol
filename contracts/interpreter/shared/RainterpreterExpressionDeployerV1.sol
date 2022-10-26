// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployer.sol";
import "../deploy/StandardIntegrity.sol";

contract RainterpreterExpressionDeployerV1 is StandardIntegrity, IExpressionDeployer {
    event SaveInterpreterState(address sender, StateConfig config);

    function deployExpression(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) external returns (address expressionAddress, uint256 contextScratch) {
            (
                uint256 scratch_,
                uint256 contextScratch_,
                uint256 stackLength_
            ) = ensureIntegrity(
                    StorageOpcodesRange(0, 0),
                    config_.sources,
                    config_.constants.length,
                    finalMinStacks_
                );

            bytes memory stateBytes_ =
                config_.serialize(
                    scratch_,
                    contextScratch_,
                    stackLength_,
                    opcodeFunctionPointers()
                );

        emit SaveInterpreterState(msg.sender, config_);
        return (SSTORE2.write(stateBytes_), contextScratch_);
    }
}