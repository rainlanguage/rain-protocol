// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../ops/AllStandardOps.sol";
import "../ops/core/OpGet.sol";
import "../../sstore2/SSTORE2.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0c790c870cdd0d2f0dad0dd90e720f3c0f710f8f101710261034104210501026105e106c107a1089109810a610b4112c113b114a11591168117711c011d211e012121220122e123c124b125a126912781287129612a512b412c312d212e112ef12fd130b131913271335134313521361136f13b90be7";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x728dcc04f098f32741ef17d3eabf6e0389b81f559c38695249f4269f8dcaddca
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
        uint256[] memory minStackOutputs_
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
        uint256[] memory minStackOutputs_
    ) internal view returns (uint256 stackLength_) {
        require(sources_.length >= minStackOutputs_.length, "BAD_MSO_LENGTH");
        IntegrityCheckState memory integrityCheckState_ = IntegrityCheckState(
            sources_,
            constantsLength_,
            INITIAL_STACK_BOTTOM,
            INITIAL_STACK_BOTTOM,
            INITIAL_STACK_BOTTOM,
            integrityFunctionPointers()
        );
        for (uint256 i_ = 0; i_ < minStackOutputs_.length; i_++) {
            LibIntegrityCheck.ensureIntegrity(
                integrityCheckState_,
                SourceIndex.wrap(i_),
                INITIAL_STACK_BOTTOM,
                minStackOutputs_[i_]
            );
        }
        return
            integrityCheckState_.stackBottom.toIndex(
                integrityCheckState_.stackMaxTop
            );
    }
}
