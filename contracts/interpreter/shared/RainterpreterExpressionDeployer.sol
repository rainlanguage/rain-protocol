// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"080c081a086f08c308e5093d0974099209a109b009be09cc09da09b009e809f60a040a130a220a300a3e0a4c0a5a0add0aec0afb0b0a0b190b280b710b830b910bc30bd10bdf0bed0bfc0c0b0c1a0c290c380c470c560c650c740c830c920ca00cae0cbc0cca0cd80ce60cf50d040d120d7c";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x37020c2bab260311ec6e046f40a4fce5e8c7233ce16471648157a95c3fbed37b
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
        uint256 contextReads
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
        EncodedConstraints[] memory constraints_
    ) external returns (address, uint256) {
        (
            uint256 contextReads_,
            uint256 stackLength_,
            uint stateChangesLength_
        ) = ensureIntegrity(
                config_.sources,
                config_.constants.length,
                constraints_
            );

        bytes memory stateBytes_ = config_.serialize(
            constraints_,
            stackLength_,
            stateChangesLength_,
            OPCODE_FUNCTION_POINTERS
        );

        address expressionAddress_ = SSTORE2.write(stateBytes_);

        emit DeployExpression(
            msg.sender,
            config_,
            expressionAddress_,
            contextReads_
        );
        return (expressionAddress_, contextReads_);
    }
}
