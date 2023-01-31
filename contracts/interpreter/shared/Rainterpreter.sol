// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpGet.sol";
import "../../kv/LibMemoryKV.sol";
import "../../sstore2/SSTORE2.sol";
import "../store/IInterpreterStoreV1.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// Thrown when the `Rainterpreter` is constructed with unknown store bytecode.
error UnexpectedStoreBytecodeHash(bytes32 actualBytecodeHash);

/// Thrown when the `Rainterpreter` is constructed with unknown opMeta.
error UnexpectedOpMetaHash(bytes32 actualOpMeta);

/// @dev Hash of the known store bytecode.
bytes32 constant STORE_BYTECODE_HASH = bytes32(
    0xbc52db76e944bf5245c516990668f268c9d2f24dc3aa1b06b4f9d128914df383
);

/// @dev Hash of the known op meta.
bytes32 constant OP_META_HASH = bytes32(
    0x2f3696e3d54355f65c5e7be86bbb8ea37687eacb0c91add9670a9c2f8ae0c7e4
);

/// All config required to construct a `Rainterpreter`.
/// @param store The `IInterpreterStoreV1`. MUST match known bytecode.
/// @param opMeta All opmeta as binary data. MAY be compressed bytes etc. The
/// opMeta describes the opcodes for this interpreter to offchain tooling.
struct RainterpreterConfig {
    address store;
    bytes opMeta;
}

/// @title Rainterpreter
/// @notice Minimal binding of the `IIinterpreterV1` interface to the
/// `LibInterpreterState` library, including every opcode in `AllStandardOps`.
/// This is the default implementation of "an interpreter" but is designed such
/// that other interpreters can easily be developed alongside. Alterpreters can
/// either be built by inheriting and overriding the functions on this contract,
/// or using the relevant libraries to construct an alternative binding to the
/// same interface.
contract Rainterpreter is IInterpreterV1 {
    using LibStackPointer for StackPointer;
    using LibInterpreterState for bytes;
    using LibInterpreterState for InterpreterState;
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;
    using LibInterpreterState for StateNamespace;

    /// The store is valid (has exact expected bytecode).
    event ValidStore(address sender, address store);

    /// This is the literal OpMeta bytes to be used offchain to make sense of the
    /// opcodes in this interpreter deployment, as a human. For formats like json
    /// that make heavy use of boilerplate, repetition and whitespace, some kind
    /// of compression such as gzip is recommended.
    /// @param sender The `msg.sender` providing the op meta.
    /// @param opMeta The raw binary data of the op meta. Maybe compressed data
    /// etc. and is intended for offchain consumption.
    event OpMeta(address sender, bytes opMeta);

    /// Ensures the correct store bytecode and emits all opmeta.
    constructor(RainterpreterConfig memory config_) {
        // Guard against an store with unknown bytecode.
        address store_ = config_.store;
        bytes32 storeHash_;
        assembly ("memory-safe") {
            storeHash_ := extcodehash(store_)
        }
        if (storeHash_ != STORE_BYTECODE_HASH) {
            /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT
            /// HONEST MISTAKES.
            revert UnexpectedStoreBytecodeHash(storeHash_);
        }

        emit ValidStore(msg.sender, store_);

        /// This IS a security check. This prevents someone making an exact
        /// bytecode copy of the interpreter and shipping different opmeta for
        /// the copy to lie about what each op does.
        bytes32 opMetaHash_ = keccak256(config_.opMeta);
        if (opMetaHash_ != OP_META_HASH) {
            revert UnexpectedOpMetaHash(opMetaHash_);
        }
        emit OpMeta(msg.sender, config_.opMeta);
    }

    /// @inheritdoc IInterpreterV1
    function eval(
        IInterpreterStoreV1 store_,
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external view returns (uint256[] memory, uint256[] memory) {
        // Decode the dispatch.
        (
            address expression_,
            SourceIndex sourceIndex_,
            uint256 maxOutputs_
        ) = LibEncodedDispatch.decode(dispatch_);

        // Build the interpreter state from the onchain expression.
        InterpreterState memory state_ = SSTORE2
            .read(expression_)
            .deserialize();
        state_.stateKV = MemoryKV.wrap(0);
        state_.namespace = namespace_.qualifyNamespace();
        state_.store = store_;
        state_.context = context_;

        // Eval the expression and return up to maxOutputs_ from the final stack.
        StackPointer stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(
            stackLength_.min(maxOutputs_)
        );
        return (tail_, state_.stateKV.toUint256Array());
    }

    /// @inheritdoc IInterpreterV1
    function functionPointers() external view virtual returns (bytes memory) {
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory localPtrs_ = new function(
                InterpreterState memory,
                Operand,
                StackPointer
            ) view returns (StackPointer)[](0);
        return
            LibConvert.unsafeTo16BitBytes(AllStandardOps
                .opcodeFunctionPointers(localPtrs_)
                .asUint256Array());
    }
}
