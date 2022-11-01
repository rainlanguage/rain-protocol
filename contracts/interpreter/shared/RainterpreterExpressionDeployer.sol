// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"081d082b088008d408f6094e098509a309b209c109cf09dd09eb09c109f90a070a150a240a330a410a4f0a5d0a6b0aee0afd0b0c0b1b0b2a0b390b820b940ba20bd40be20bf00bfe0c0d0c1c0c2b0c3a0c490c580c670c760c850c940ca30cb10cbf0ccd0cdb0ce90cf80d070d150d7f";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x2b4248b9be0943364b68e5a7bdb4cfe6218e70a4c4058d47104cdecff6f2ebb1
);
uint256 constant INTEGRITY_CHECK = 1;

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
        if (INTEGRITY_CHECK > 0) {
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
        } else {
            console.log("!!!DEPLOYER INTEGRITY CHECK DISABLED!!!");
        }
    }

    function deployExpression(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) external returns (address, uint256) {
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
