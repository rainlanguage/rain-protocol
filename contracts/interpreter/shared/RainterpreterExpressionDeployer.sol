// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.datacontract/lib/LibDataContract.sol";

import "rain.interpreter/interface/IExpressionDeployerV1.sol";
import "rain.interpreter/interface/unstable/IDebugInterpreterV1.sol";
import "rain.interpreter/interface/unstable/IDebugExpressionDeployerV1.sol";
import "rain.interpreter/lib/state/LibInterpreterStateDataContract.sol";
import "../ops/AllStandardOps.sol";
import "rain.factory/src/lib/LibIERC1820.sol";
import {IERC165Upgradeable as IERC165} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

/// @dev Thrown when the pointers known to the expression deployer DO NOT match
/// the interpreter it is constructed for. This WILL cause undefined expression
/// behaviour so MUST REVERT.
/// @param actualPointers The actual function pointers found at the interpreter
/// address upon construction.
error UnexpectedPointers(bytes actualPointers);

/// Thrown when the `RainterpreterExpressionDeployer` is constructed with unknown
/// interpreter bytecode.
/// @param actualBytecodeHash The bytecode hash that was found at the interpreter
/// address upon construction.
error UnexpectedInterpreterBytecodeHash(bytes32 actualBytecodeHash);

/// @dev There are more entrypoints defined by the minimum stack outputs than
/// there are provided sources. This means the calling contract WILL attempt to
/// eval a dangling reference to a non-existent source at some point, so this
/// MUST REVERT.
error MissingEntrypoint(uint256 expectedEntrypoints, uint256 actualEntrypoints);

/// Thrown when the `Rainterpreter` is constructed with unknown store bytecode.
/// @param actualBytecodeHash The bytecode hash that was found at the store
/// address upon construction.
error UnexpectedStoreBytecodeHash(bytes32 actualBytecodeHash);

/// Thrown when the `Rainterpreter` is constructed with unknown opMeta.
error UnexpectedOpMetaHash(bytes32 actualOpMeta);

/// @dev The function pointers known to the expression deployer. These are
/// immutable for any given interpreter so once the expression deployer is
/// constructed and has verified that this matches what the interpreter reports,
/// it can use this constant value to compile and serialize expressions.

bytes constant OPCODE_FUNCTION_POINTERS = hex"0dd90df00dff0e940ea30ef50f650fed10cc112211bb135b139b13b913c813d613e513f31401140f141d13e5142b143914b714c514d314e114ef14fe150d151c152b153a15491558156715761585159415e215f41602163416421650165e166c167a1688169616a416b216c016ce16dc16ea16f81706171417221730173e174d175c176b17791787179517a317b117bf17cd18f919811990199f19ad1a1f";

/// @dev Hash of the known interpreter bytecode.
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0xf4a4777289d32f6f51d8bebc14aa8196f32cf56ae62797c35db65c1aa1a84e17
);

/// @dev Hash of the known store bytecode.
bytes32 constant STORE_BYTECODE_HASH = bytes32(
    0xd6130168250d3957ae34f8026c2bdbd7e21d35bb202e8540a9b3abcbc232ddb6
);

/// @dev Hash of the known op meta.
bytes32 constant OP_META_HASH = bytes32(
    0x37042217d6e1a50790fcea19503943302d7779a9b47d61dcadf07ffecc4c0812
);

/// All config required to construct a `Rainterpreter`.
/// @param store The `IInterpreterStoreV1`. MUST match known bytecode.
/// @param opMeta All opmeta as binary data. MAY be compressed bytes etc. The
/// opMeta describes the opcodes for this interpreter to offchain tooling.
struct RainterpreterExpressionDeployerConstructionConfig {
    address interpreter;
    address store;
    bytes meta;
}

/// @title RainterpreterExpressionDeployer
/// @notice Minimal binding of the `IExpressionDeployerV1` interface to the
/// `LibIntegrityCheck.ensureIntegrity` loop and `AllStandardOps`.
contract RainterpreterExpressionDeployer is
    IExpressionDeployerV1,
    IDebugExpressionDeployerV1,
    IERC165
{
    using LibStackPointer for Pointer;
    using LibUint256Array for uint256[];

    /// The config of the deployed expression including uncompiled sources. Will
    /// only be emitted after the config passes the integrity check.
    /// @param sender The caller of `deployExpression`.
    /// @param sources As per `IExpressionDeployerV1`.
    /// @param constants As per `IExpressionDeployerV1`.
    /// @param minOutputs As per `IExpressionDeployerV1`.
    event NewExpression(
        address sender,
        bytes[] sources,
        uint256[] constants,
        uint256[] minOutputs
    );

    /// The address of the deployed expression. Will only be emitted once the
    /// expression can be loaded and deserialized into an evaluable interpreter
    /// state.
    /// @param sender The caller of `deployExpression`.
    /// @param expression The address of the deployed expression.
    event ExpressionAddress(address sender, address expression);

    IInterpreterV1 public immutable interpreter;
    IInterpreterStoreV1 public immutable store;

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(
        RainterpreterExpressionDeployerConstructionConfig memory config_
    ) {
        IInterpreterV1 interpreter_ = IInterpreterV1(config_.interpreter);
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = interpreter_.functionPointers();
        if (
            keccak256(functionPointers_) != keccak256(OPCODE_FUNCTION_POINTERS)
        ) {
            revert UnexpectedPointers(functionPointers_);
        }
        // Guard against an interpreter with unknown bytecode.
        bytes32 interpreterHash_;
        assembly ("memory-safe") {
            interpreterHash_ := extcodehash(interpreter_)
        }
        if (interpreterHash_ != INTERPRETER_BYTECODE_HASH) {
            /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT
            /// HONEST MISTAKES.
            revert UnexpectedInterpreterBytecodeHash(interpreterHash_);
        }

        // Guard against an store with unknown bytecode.
        IInterpreterStoreV1 store_ = IInterpreterStoreV1(config_.store);
        bytes32 storeHash_;
        assembly ("memory-safe") {
            storeHash_ := extcodehash(store_)
        }
        if (storeHash_ != STORE_BYTECODE_HASH) {
            /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT
            /// HONEST MISTAKES.
            revert UnexpectedStoreBytecodeHash(storeHash_);
        }

        /// This IS a security check. This prevents someone making an exact
        /// bytecode copy of the interpreter and shipping different meta for
        /// the copy to lie about what each op does in the interpreter.
        bytes32 opMetaHash_ = keccak256(config_.meta);
        if (opMetaHash_ != OP_META_HASH) {
            revert UnexpectedOpMetaHash(opMetaHash_);
        }

        interpreter = interpreter_;
        store = store_;

        emit DISpair(
            msg.sender,
            address(this),
            config_.interpreter,
            config_.store,
            config_.meta
        );

        IERC1820_REGISTRY.setInterfaceImplementer(
            address(this),
            IERC1820_REGISTRY.interfaceHash(
                IERC1820_NAME_IEXPRESSION_DEPLOYER_V1
            ),
            address(this)
        );
    }

    // @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId_
    ) public view virtual override returns (bool) {
        return
            interfaceId_ == type(IExpressionDeployerV1).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
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
            function(IntegrityCheckState memory, Operand, Pointer)
                view
                returns (Pointer)[]
                memory
        )
    {
        return AllStandardOps.integrityFunctionPointers();
    }

    /// @inheritdoc IDebugExpressionDeployerV1
    function offchainDebugEval(
        bytes[] memory sources,
        uint256[] memory constants,
        FullyQualifiedNamespace namespace,
        uint256[][] memory context,
        SourceIndex sourceIndex,
        uint256[] memory initialStack,
        uint8 minOutputs
    ) external view returns (uint256[] memory, uint256[] memory) {
        IntegrityCheckState memory integrityCheckState = LibIntegrityCheck
            .newState(sources, constants, integrityFunctionPointers());
        Pointer stackTop = integrityCheckState.stackBottom;
        stackTop = LibIntegrityCheck.push(
            integrityCheckState,
            stackTop,
            initialStack.length
        );
        LibIntegrityCheck.ensureIntegrity(
            integrityCheckState,
            sourceIndex,
            stackTop,
            minOutputs
        );
        uint256[] memory stack;
        {
            int256 stackLength = integrityCheckState
                .stackBottom
                .toIndexSigned(integrityCheckState.stackMaxTop);
            for (uint256 i_; i_ < sources.length; i_++) {
                LibCompile.unsafeCompile(
                    sources[i_],
                    OPCODE_FUNCTION_POINTERS
                );
            }

            require(stackLength >= 0, "Stack underflow");
            stack = new uint256[](uint256(stackLength));
            LibMemCpy.unsafeCopyWordsTo(
                initialStack.dataPointer(),
                stack.dataPointer(),
                initialStack.length
            );
        }

        return
            IDebugInterpreterV1(address(interpreter)).offchainDebugEval(
                store,
                namespace,
                sources,
                constants,
                context,
                stack,
                sourceIndex
            );
    }

    function integrityCheck(
        bytes[] memory sources,
        uint256[] memory constants,
        uint256[] memory minOutputs
    ) internal view returns (uint256) {
        // Ensure that we are not missing any entrypoints expected by the calling
        // contract.
        if (minOutputs.length > sources.length) {
            revert MissingEntrypoint(minOutputs.length, sources.length);
        }

        // Build the initial state of the integrity check.
        IntegrityCheckState memory integrityCheckState = LibIntegrityCheck
            .newState(sources, constants, integrityFunctionPointers());
        // Loop over each possible entrypoint as defined by the calling contract
        // and check the integrity of each. At the least we need to be sure that
        // there are no out of bounds stack reads/writes and to know the total
        // memory to allocate when later deserializing an associated interpreter
        // state for evaluation.
        Pointer initialStackBottom = integrityCheckState.stackBottom;
        Pointer initialStackHighwater = integrityCheckState.stackHighwater;
        for (uint16 i_ = 0; i_ < minOutputs.length; i_++) {
            // Reset the top, bottom and highwater between each entrypoint as
            // every external eval MUST have a fresh stack, but retain the max
            // stack height as the latter is used for unconditional memory
            // allocation so MUST be the max height across all possible
            // entrypoints.
            integrityCheckState.stackBottom = initialStackBottom;
            integrityCheckState.stackHighwater = initialStackHighwater;
            LibIntegrityCheck.ensureIntegrity(
                integrityCheckState,
                SourceIndex.wrap(i_),
                INITIAL_STACK_BOTTOM,
                uint8(minOutputs[i_])
            );
        }

        int256 finalIndex = integrityCheckState.stackBottom.toIndexSigned(
                integrityCheckState.stackMaxTop
            );
        require(finalIndex >= 0, "Stack underflow");
        return uint256(finalIndex);
    }

    /// @inheritdoc IExpressionDeployerV1
    function deployExpression(
        bytes[] memory sources_,
        uint256[] memory constants_,
        uint256[] memory minOutputs_
    ) external returns (IInterpreterV1, IInterpreterStoreV1, address) {
        uint256 stackLength_ = integrityCheck(
            sources_,
            constants_,
            minOutputs_
        );

        // Emit the config of the expression _before_ we serialize it, as the
        // serialization process itself is destructive of the sources in memory.
        emit NewExpression(msg.sender, sources_, constants_, minOutputs_);

        (
            DataContractMemoryContainer container_,
            Pointer pointer_
        ) = LibDataContract.newContainer(
                LibInterpreterStateDataContract.serializeSize(
                    sources_,
                    constants_
                )
            );

        // Serialize the state config into bytes that can be deserialized later
        // by the interpreter. This will compile the sources according to the
        // provided function pointers.
        LibInterpreterStateDataContract.unsafeSerialize(
            pointer_,
            sources_,
            constants_,
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        // Deploy the serialized expression onchain.
        address expression_ = LibDataContract.write(container_);

        // Emit and return the address of the deployed expression.
        emit ExpressionAddress(msg.sender, expression_);

        return (interpreter, store, expression_);
    }
}
