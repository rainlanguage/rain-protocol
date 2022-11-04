// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"082c083a088f08e30905095d099409b209c109d009de09ec09fa09d00a080a160a240a330a420a500a5e0a6c0a7a0afd0b0c0b1b0b2a0b390b480b910ba30bb10be30bf10bff0c0d0c1c0c2b0c3a0c490c580c670c760c850c940ca30cb20cc00cce0cdc0cea0cf80d060d140d220d310d400d4e0db8";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0xa8451c31ccda1e67d5b0b0bb7a095446169797563647cab699c5dd529a99eecb
);

contract RainterpreterExpressionDeployer is
    StandardIntegrity,
    IExpressionDeployerV1
{
    using LibInterpreterState for StateConfig;

    event ValidInterpreter(address sender, address interpreter);
    event DeployExpression(
        address sender,
        StateConfig config,
        address expressionAddress,
        uint256 contextScratch
    );

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreterV1(interpreter_)
            .functionPointers();
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
    ) external returns (address, uint256) {
        (uint256 contextScratch_, uint256 stackLength_) = ensureIntegrity(
            StorageOpcodesRange(0, 0),
            config_.sources,
            config_.constants.length,
            finalMinStacks_
        );

        bytes memory stateBytes_ = config_.serialize(
            contextScratch_,
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        address expressionAddress_ = SSTORE2.write(stateBytes_);

        emit DeployExpression(
            msg.sender,
            config_,
            expressionAddress_,
            contextScratch_
        );
        return (expressionAddress_, contextScratch_);
    }
}
