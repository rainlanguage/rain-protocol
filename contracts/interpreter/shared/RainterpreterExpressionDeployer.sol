// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0a9a0aa80afe0b910be50c110caa0cdf0cfd0d0c0d1a0d280d360d0c0d440d520d600d6f0d7e0d8c0d9a0da80db60e390e480e570e660e750e840ecd0edf0eed0f1f0f2d0f3b0f490f580f670f760f850f940fa30fb20fc10fd00fdf0fee0ffc100a101810261034104210511060106e10e00a09";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0xb6f8abc164b86a5d85a63c7d4249153c2b0cf4e27f95c8fe181a2bee82766407
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
        uint[] memory minStackOutputs_
    ) external returns (address, uint256) {
        (
            uint256 contextReads_,
            uint256 stackLength_,
            uint stateChangesLength_
        ) = ensureIntegrity(
                config_.sources,
                config_.constants.length,
                minStackOutputs_
            );

        bytes memory stateBytes_ = config_.serialize(
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
