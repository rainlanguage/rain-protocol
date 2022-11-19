// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";
import "../ops/core/OpReadState.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0a9a0aa80afe0b910be30c0f0ca80cdd0cfb0d0a0d180d260d340d0a0d420d500d5e0d6d0d7c0d8a0d980da60db40e370e460e550e640e730e820ecb0edd0eeb0f1d0f2b0f390f470f560f650f740f830f920fa10fb00fbf0fce0fdd0fec0ffa10081016102410321040104f105e106c10de0a09";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0xa84610bc79bd1e9ca384f043d5885e6411830e57d152f3381502c171d60316c1
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

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        override
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, Operand, StackTop) view returns (StackTop)[] memory localFnPtrs_ = new function(IntegrityState memory, Operand, StackTop) view returns (StackTop)[](1);
        localFnPtrs_[0] = OpReadState.integrity;
        return localFnPtrs_;
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
