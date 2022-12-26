// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../ops/AllStandardOps.sol";
import "../ops/core/OpGet.sol";
import "../../sstore2/SSTORE2.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0c6d0c7b0cd10d230da10dcd0e660f300f650f83100b101a102810361044101a10521060106e107d108c109a10a81120112f113e114d115c116b11b411c611d41206121412221230123f124e125d126c127b128a129912a812b712c612d512e312f112ff130d131b1329133713461355136313da0bdb";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x2230a80fd94fd929380b02e3ad34c3da313ad6be3ee9bae9ff5e05352fc40a49
);

contract RainterpreterExpressionDeployer is IExpressionDeployerV1 {
    using LibInterpreterState for StateConfig;
    using LibStackPointer for StackPointer;

    event ValidInterpreter(address sender, address interpreter);
    event ExpressionConfig(address sender, StateConfig config);
    event ExpressionDeployed(address sender, address expression);

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

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityCheckState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory
        )
    {
        function(IntegrityCheckState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory localFnPtrs_ = new function(
                IntegrityCheckState memory,
                Operand,
                StackPointer
            ) view returns (StackPointer)[](1);
        localFnPtrs_[0] = OpGet.integrity;
        return AllStandardOps.integrityFunctionPointers(localFnPtrs_);
    }

    function deployExpression(
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) external returns (address) {
        uint256 stackLength_ = ensureIntegrity(
            config_.sources,
            config_.constants.length,
            minStackOutputs_
        );

        emit ExpressionConfig(msg.sender, config_);

        bytes memory stateBytes_ = config_.serialize(
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        address expression_ = SSTORE2.write(stateBytes_);

        emit ExpressionDeployed(msg.sender, expression_);
        return expression_;
    }

    function ensureIntegrity(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint[] memory minStackOutputs_
    ) internal view returns (uint256 stackLength_) {
        require(sources_.length >= minStackOutputs_.length, "BAD_MSO_LENGTH");
        IntegrityCheckState memory integrityState_ = IntegrityCheckState(
            sources_,
            constantsLength_,
            StackPointer.wrap(0),
            StackPointer.wrap(0),
            integrityFunctionPointers()
        );
        for (uint256 i_ = 0; i_ < minStackOutputs_.length; i_++) {
            LibIntegrityCheck.ensureIntegrity(
                integrityState_,
                SourceIndex.wrap(i_),
                StackPointer.wrap(0),
                minStackOutputs_[i_]
            );
        }
        return integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop);
    }
}
