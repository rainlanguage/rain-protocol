// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"080c081a086f08c308e5093d0974099209a109b009be09cc09da09b009e809f60a040a130a220a300a3e0a4c0a5a0add0aec0afb0b0a0b190b280b710b830b910bc30bd10bdf0bed0bfc0c0b0c1a0c290c380c470c560c650c740c830c920ca00cae0cbc0cca0cd80ce60cf50d040d120d7c";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x30dc8fa598f3c47fc1ffcb628a52cf2ac25f69db797ab063b2b71bac4af608bd
);

contract RainterpreterExpressionDeployer is
    StandardIntegrity,
    IExpressionDeployerV1
{
    using LibInterpreterState for StateConfig;

    event ValidInterpreter(address sender, address interpreter);
    event ExpressionConfig(
        address sender,
        StateConfig config,
        uint contextReads
    );
    event ExpressionDeployed(
        address sender,
        address expression
    );

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreterV1(interpreter_)
            .functionPointers();
        if (keccak256(functionPointers_) != OPCODE_FUNCTION_POINTERS_HASH) {
            console.logBytes(functionPointers_);
            revert("BAD_POINTERS");
        }

        // Guard against an interpreter with unknown/untrusted bytecode that
        // could run arbitrary logic even if the function pointers are identical
        // to the known/trusted interpreter.
        bytes32 interpreterHash_;
        assembly ("memory-safe") {
            interpreterHash_ := extcodehash(interpreter_)
        }
        if (interpreterHash_ != INTERPRETER_BYTECODE_HASH) {
            console.logBytes(abi.encodePacked(interpreterHash_));
            revert("BAD_INTERPRETER_HASH");
        }

        emit ValidInterpreter(msg.sender, interpreter_);
    }

    function deployExpression(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) external returns (address, uint256) {
        (uint256 contextReads_, uint256 stackLength_) = ensureIntegrity(
            StorageOpcodesRange(0, 0),
            config_.sources,
            config_.constants.length,
            finalMinStacks_
        );

        emit ExpressionConfig(
            msg.sender,
            config_,
            contextReads_
        );

        bytes memory stateBytes_ = config_.serialize(
            contextReads_,
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        address expression_ = SSTORE2.write(stateBytes_);
        emit ExpressionDeployed(msg.sender, expression_);
        return (expression_, contextReads_);
    }
}
