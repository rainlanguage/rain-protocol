// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../ops/AllStandardOps.sol";
import "../ops/core/OpGet.sol";
import "../../sstore2/SSTORE2.sol";

/// @dev Thrown when the pointers known to the expression deployer DO NOT match
/// the interpreter it is constructed for. This WILL cause undefined expression
/// behaviour so MUST REVERT.
error UnexpectedPointers(bytes actualPointers);

/// @dev There are more entrypoints defined by the minimum stack outputs than
/// there are provided sources. This means the calling contract WILL attempt to
/// eval a dangling reference to a non-existent source at some point, so this
/// MUST REVERT.
error MissingEntrypoint(uint256 expectedEntrypoints, uint256 actualEntrypoints);

/// @dev The function pointers known to the expression deployer. These are
/// immutable for any given interpreter so once the expression deployer is
/// constructed and has verified that this matches what the interpreter reports,
/// it can use this constant value to compile and serialize expressions.
bytes constant OPCODE_FUNCTION_POINTERS = hex"0a010a0f0a650ab70b350b610bfa0cc40df90e2e0e4c0ed40ee30ef10eff0f0d0ee30f1b0f290f370f460f550f630f710fe90ff81007101610251034107d108f109d10cf10dd10eb10f9110811171126113511441153116211711180118f119e11ac11ba11c811d611e411f21200120f121e122c12a3";

/// @title RainterpreterExpressionDeployer
/// @notice Minimal binding of the `IExpressionDeployerV1` interface to the
/// `LibIntegrityCheck.ensureIntegrity` loop and `AllStandardOps`.
contract RainterpreterExpressionDeployer is IExpressionDeployerV1 {
    using LibInterpreterState for StateConfig;
    using LibStackPointer for StackPointer;

    /// The interpreter passed in construction is valid. ANY interpreter with
    /// the same function pointers will be considered valid. It is the
    /// responsibility of the caller to decide whether they trust the _bytecode_
    /// of the interpreter as many possible bytecodes compile to the same set of
    /// function pointers.
    /// @param sender The account that constructed the expression deployer.
    /// @param interpreter The address of the interpreter that the expression
    /// deployer agrees to perform integrity checks for. Note that the pairing
    /// between interpreter and expression deployer needs to be checked and
    /// enforced elsewhere offchain and/or onchain.
    event ValidInterpreter(address sender, address interpreter);

    /// The config of the deployed expression including uncompiled sources. Will
    /// only be emitted after the config passes the integrity check.
    /// @param sender The caller of `deployExpression`.
    /// @param config The config for the deployed expression.
    event ExpressionConfig(address sender, StateConfig config);

    /// The address of the deployed expression. Will only be emitted once the
    /// expression can be loaded and deserialized into an evaluable interpreter
    /// state.
    /// @param sender The caller of `deployExpression`.
    /// @param expression The address of the deployed expression.
    event ExpressionDeployed(address sender, address expression);

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreterV1(interpreter_)
            .functionPointers();
        if (
            keccak256(functionPointers_) != keccak256(OPCODE_FUNCTION_POINTERS)
        ) {
            revert UnexpectedPointers(functionPointers_);
        }

        emit ValidInterpreter(msg.sender, interpreter_);
    }

    /// Defines all the function pointers to integrity checks. This is the
    /// expression deployer's equivalent of the opcode function pointers and
    /// follows a near identical dispatch process. These are never compiled into
    /// source and are instead indexed into directly by the integrity check. The
    /// indexing into integrity pointers (which has an out of bounds check) is a
    /// proxy for enforcing that all opcode pointers exist at runtime, so the
    /// length of the integrity pointers MUST match the length of opcode function
    /// pointers. This function is `virtual` so that it can be overridden
    /// pairwise with overrides to `functionPointers` on `Rainterpreter`.
    /// @return The list of integrity function pointers.
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
            ) view returns (StackPointer)[](0);
        return AllStandardOps.integrityFunctionPointers(localFnPtrs_);
    }

    /// @inheritdoc IExpressionDeployerV1
    function deployExpression(
        StateConfig memory config_,
        uint256[] memory minStackOutputs_
    ) external returns (address) {
        // Ensure that we are not missing any entrypoints expected by the calling
        // contract.
        if (minStackOutputs_.length > config_.sources.length) {
            revert MissingEntrypoint(
                minStackOutputs_.length,
                config_.sources.length
            );
        }

        // Build the initial state of the integrity check.
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(config_, integrityFunctionPointers());
        // Loop over each possible entrypoint as defined by the calling contract
        // and check the integrity of each. At the least we need to be sure that
        // there are no out of bounds stack reads/writes and to know the total
        // memory to allocate when later deserializing an associated interpreter
        // state for evaluation.
        StackPointer initialStackBottom_ = integrityCheckState_.stackBottom;
        StackPointer initialStackHighwater_ = integrityCheckState_
            .stackHighwater;
        for (uint256 i_ = 0; i_ < minStackOutputs_.length; i_++) {
            // Reset the top, bottom and highwater between each entrypoint as
            // every external eval MUST have a fresh stack, but retain the max
            // stack height as the latter is used for unconditional memory
            // allocation so MUST be the max height across all possible
            // entrypoints.
            integrityCheckState_.stackBottom = initialStackBottom_;
            integrityCheckState_.stackHighwater = initialStackHighwater_;
            LibIntegrityCheck.ensureIntegrity(
                integrityCheckState_,
                SourceIndex.wrap(i_),
                INITIAL_STACK_BOTTOM,
                minStackOutputs_[i_]
            );
        }
        uint256 stackLength_ = integrityCheckState_.stackBottom.toIndex(
            integrityCheckState_.stackMaxTop
        );

        // Emit the config of the expression _before_ we serialize it, as the
        // serialization process itself is destructive of the config in memory.
        emit ExpressionConfig(msg.sender, config_);

        // Serialize the state config into bytes that can be deserialized later
        // by the interpreter. This will compile the sources according to the
        // provided function pointers.
        bytes memory stateBytes_ = config_.serialize(
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        // Deploy the serialized expression onchain.
        address expression_ = SSTORE2.write(stateBytes_);

        // Emit and return the address of the deployed expression.
        emit ExpressionDeployed(msg.sender, expression_);

        return expression_;
    }
}
