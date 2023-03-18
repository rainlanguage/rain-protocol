// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "sol.lib.datacontract/LibDataContract.sol";

import "../deploy/IExpressionDeployerV1.sol";
import "../ops/AllStandardOps.sol";
import "../../ierc1820/LibIERC1820.sol";
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
bytes constant OPCODE_FUNCTION_POINTERS = hex"0ac70ad60ae50b680b760bc80c380cb60d800dd60e020e9b102f106410821091109f10ae10bc10ca10d810e610ae10f411021111111f112d113c114b115a116911781187119611a511b411c311d211e111f011ff1248125a1268129a12a812b612c412d212e012ee12fc130a13181326133413421350135e136c137a1388139613a413b313c213d113df13ed13fb1409141714251433156115e915f8160716151687";

/// @dev Hash of the known interpreter bytecode.
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x8d0e104deee41d5fc225f10c7f00a135848d4eb7639760781effaee1e662feb8
);

/// @dev Hash of the known store bytecode.
bytes32 constant STORE_BYTECODE_HASH = bytes32(
    0x322d1564d1dd8342673db470c1fe4eb9badd049e3c088ba21c4062b81a050595
);

/// @dev Hash of the known op meta.
bytes32 constant OP_META_HASH = bytes32(
    0xc633bd425d2c692ef398442774a5c7c81427e04268c7169fcd1670f93ada0731
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
contract RainterpreterExpressionDeployer is IExpressionDeployerV1, IERC165 {
    using LibStackPointer for StackPointer;

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
        bytes[] memory sources_,
        uint256[] memory constants_,
        uint256[] memory minOutputs_
    ) external returns (IInterpreterV1, IInterpreterStoreV1, address) {
        // Ensure that we are not missing any entrypoints expected by the calling
        // contract.
        if (minOutputs_.length > sources_.length) {
            revert MissingEntrypoint(minOutputs_.length, sources_.length);
        }

        // Build the initial state of the integrity check.
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        // Loop over each possible entrypoint as defined by the calling contract
        // and check the integrity of each. At the least we need to be sure that
        // there are no out of bounds stack reads/writes and to know the total
        // memory to allocate when later deserializing an associated interpreter
        // state for evaluation.
        StackPointer initialStackBottom_ = integrityCheckState_.stackBottom;
        StackPointer initialStackHighwater_ = integrityCheckState_
            .stackHighwater;
        for (uint256 i_ = 0; i_ < minOutputs_.length; i_++) {
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
                minOutputs_[i_]
            );
        }
        uint256 stackLength_ = integrityCheckState_.stackBottom.toIndex(
            integrityCheckState_.stackMaxTop
        );

        // Emit the config of the expression _before_ we serialize it, as the
        // serialization process itself is destructive of the sources in memory.
        emit NewExpression(msg.sender, sources_, constants_, minOutputs_);

        (
            DataContractMemoryContainer container_,
            Pointer pointer_
        ) = LibDataContract.newContainer(
                LibInterpreterState.serializeSize(
                    sources_,
                    constants_,
                    stackLength_
                )
            );

        // Serialize the state config into bytes that can be deserialized later
        // by the interpreter. This will compile the sources according to the
        // provided function pointers.
        LibInterpreterState.serialize(
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
