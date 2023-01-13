// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpGet.sol";
import "../../kv/LibMemoryKV.sol";
import "../../sstore2/SSTORE2.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../store/IInterpreterStoreV1.sol";

error UnexpectedStoreBytecodeHash(bytes32 actualBytecodeHash);

bytes32 constant STORE_BYTECODE_HASH = bytes32(
    0x873c646d9c16e7f0db19840a6306b190e1f2f98ae87b423609825ee0501df881
);

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
    using LibConvert for uint256[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;
    using LibInterpreterState for StateNamespace;

    IInterpreterStoreV1 internal immutable store;

    /// The store is valid (has exact expected bytecode).
    event ValidStore(address sender, address store);

    /// This is the literal OpMeta bytes to be used offchain to make sense of the
    /// opcodes in this interpreter deployment, as a human. For formats like json
    /// that make heavy use of boilerplate, repetition and whitespace, some kind
    /// of compressino such as gzip is recommended.
    event OpMeta(address sender, bytes opMeta);

    constructor(RainterpreterConfig memory config_) {
        // Guard against an store with unknown bytecode.
        bytes32 storeHash_;
        address store_ = config_.store;
        assembly ("memory-safe") {
            storeHash_ := extcodehash(store_)
        }
        if (storeHash_ != STORE_BYTECODE_HASH) {
            /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT
            /// HONEST MISTAKES.
            revert UnexpectedStoreBytecodeHash(storeHash_);
        }

        emit ValidStore(msg.sender, store_);
        store = IInterpreterStoreV1(store_);

        emit OpMeta(msg.sender, config_.opMeta);
    }

    /// @inheritdoc IInterpreterV1
    function eval(
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    )
        external
        view
        returns (uint256[] memory, IInterpreterStoreV1, uint256[] memory)
    {
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
        state_.store = store;
        state_.context = context_;

        // Eval the expression and return up to maxOutputs_ from the final stack.
        StackPointer stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(
            stackLength_.min(maxOutputs_)
        );
        return (tail_, store, state_.stateKV.toUint256Array());
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
            AllStandardOps
                .opcodeFunctionPointers(localPtrs_)
                .asUint256Array()
                .unsafeTo16BitBytes();
    }
}
