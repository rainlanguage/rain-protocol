// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployer.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"07d5082a087e08a008f8092f094d095c096a09780986095c099409a209b009bf09cd09db09e909f70a7a0a890a980aa70ab60ac50b0e0b200b2e0b600b6e0b7c0b8a0b990ba80bb70bc60bd50be40bf30c020c110c200c2f0c3e0c4d0c5b0cc3";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x94ad3a45e23c98b382f9eaa21052da52bc9640940143afdc27cf24e3ad327f3f
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
        address expressionAddress,
        uint contextScratch
    );

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreter(interpreter_)
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

        emit DeployExpression(msg.sender, config_, expressionAddress_, contextScratch_);
        return (expressionAddress_, contextScratch_);
    }
}
