// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployer.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(OPCODE_FUNCTION_POINTERS);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(0);

contract RainterpreterExpressionDeployerV1 is StandardIntegrity, IExpressionDeployer {
    using LibInterpreterState for StateConfig;
    event SaveInterpreterState(address sender, StateConfig config);

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor (address interpreter_) {
        bytes memory functionPointers_ = IInterpreter(interpreter_).functionPointers();
        console.logBytes(functionPointers_);
        require(
            keccak256(functionPointers_) == OPCODE_FUNCTION_POINTERS_HASH,
            "BAD_POINTERS"
        );

        bytes32 interpreterHash_;
        assembly ("memory-safe") {
            interpreterHash_ := extcodehash(interpreter_)
        }
        console.logBytes(abi.encodePacked(interpreterHash_));
        require(interpreterHash_ == INTERPRETER_BYTECODE_HASH, "BAD_INTERPRETER_HASH");
    }

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
                    OPCODE_FUNCTION_POINTERS
                );

        emit SaveInterpreterState(msg.sender, config_);
        return (SSTORE2.write(stateBytes_), contextScratch_);
    }
}