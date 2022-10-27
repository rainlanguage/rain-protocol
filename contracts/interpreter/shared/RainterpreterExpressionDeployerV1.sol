// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployer.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x4be7d57a5cdc25d41e18fd6f98354de6d430dcf7b073b48faaa2841e358b89c3
);

contract RainterpreterExpressionDeployerV1 is
    StandardIntegrity,
    IExpressionDeployer
{
    using LibInterpreterState for StateConfig;

    event ValidInterpreter(address sender, address interpreter);
    event DeployExpression(
        address sender,
        StateConfig config,
        address expressionAddress
    );

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreter(interpreter_)
            .functionPointers();
        console.logBytes32(OPCODE_FUNCTION_POINTERS_HASH);
        console.logBytes(functionPointers_);
        require(
            keccak256(functionPointers_) == OPCODE_FUNCTION_POINTERS_HASH,
            "BAD_POINTERS"
        );

        // Guard against an interpreter with unknown/untrusted bytecode that
        // could run arbitrary logic even if the function pointers are identical
        // to the known/trusted interpreter.
        bytes32 interpreterHash_;
        assembly ("memory-safe") {
            interpreterHash_ := extcodehash(interpreter_)
        }
        console.logBytes32(INTERPRETER_BYTECODE_HASH);
        console.logBytes(abi.encodePacked(interpreterHash_));
        require(
            interpreterHash_ == INTERPRETER_BYTECODE_HASH,
            "BAD_INTERPRETER_HASH"
        );

        emit ValidInterpreter(msg.sender, interpreter_);
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

        bytes memory stateBytes_ = config_.serialize(
            scratch_,
            contextScratch_,
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        emit DeployExpression(msg.sender, config_, expressionAddress);
        return (SSTORE2.write(stateBytes_), contextScratch_);
    }
}
