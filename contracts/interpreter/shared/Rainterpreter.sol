// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpGet.sol";
import "../../kv/LibMemoryKV.sol";
import "../../sstore2/SSTORE2.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../store/IInterpreterStoreV1.sol";

/// Thrown when the caller of a self static call is not self.
error SelfStaticCaller(address caller);

/// @title Rainterpreter
/// @notice Minimal binding of the `IIinterpreterV1` interface to the
/// `LibInterpreterState` library, including every opcode in `AllStandardOps`.
/// This is the default implementation of "an interpreter" but is designed such
/// that other interpreters can easily be developed alongside. Alterpreters can
/// either be built by inheriting and overriding the functions on this contract,
/// or using the relevant libraries to construct an alternative binding to the
/// same interface.
contract Rainterpreter is IInterpreterV1, IInterpreterStoreV1 {
    using LibStackPointer for StackPointer;
    using LibInterpreterState for bytes;
    using LibInterpreterState for InterpreterState;
    using LibInterpreterState for StateNamespace;
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];
    using LibConvert for uint256[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;

    /// Store is several tiers of sandbox.
    ///
    /// 0. address is msg.sender so that callers cannot attack each other
    /// 1. StateNamespace is caller-provided namespace so that expressions cannot
    ///    attack each other
    /// 2. uint256 is expression-provided key
    /// 3. uint256 is expression-provided value
    ///
    /// tiers 0 and 1 are both embodied in the `FullyQualifiedNamespace`.
    mapping(FullyQualifiedNamespace => mapping(uint256 => uint256))
        internal store;

    /// Guards against `msg.sender` calling `eval` in a non-static way and
    /// providing function pointers in the eval to attempt to manipulate state.
    /// For example, perhaps there is some way an attacker could carefully craft
    /// function pointers such that `stateChanges` is executed within an `eval`.
    /// This function can only be called externally by the interpreter itself and
    /// guards all code paths that dispatch logic by direct function pointer. The
    /// interpreter will only ever call itself statically according to
    /// `external view` so restricting callers to self is enough to restrict all
    /// calls to static over untrusted function pointers.
    /// @param namespace_ The fully qualified namespace can be provided directly
    /// here as this function can only be called by self.
    /// @param dispatch_ As per `eval`.
    /// @param context_ As per `eval`.
    function selfStaticEval(
        FullyQualifiedNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    )
        external
        view
        returns (uint256[] memory, IInterpreterStoreV1, uint256[] memory)
    {
        if (msg.sender != address(this)) {
            revert SelfStaticCaller(msg.sender);
        }
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
        state_.namespace = namespace_;
        state_.context = context_;

        // Eval the expression and return up to maxOutputs_ from the final stack.
        StackPointer stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(
            stackLength_.min(maxOutputs_)
        );
        return (tail_, this, state_.stateKV.toUint256Array());
    }

    /// @inheritdoc IInterpreterV1
    function eval(
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] calldata context_
    )
        external
        view
        returns (uint256[] memory, IInterpreterStoreV1, uint256[] memory)
    {
        return
            this.selfStaticEval(
                namespace_.qualifyNamespace(),
                dispatch_,
                context_
            );
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

    /// @inheritdoc IInterpreterStoreV1
    function set(StateNamespace namespace_, uint256[] calldata kvs_) external {
        FullyQualifiedNamespace fullyQualifiedNamespace_ = namespace_
            .qualifyNamespace();
        unchecked {
            for (uint256 i_ = 0; i_ < kvs_.length; i_ += 2) {
                store[fullyQualifiedNamespace_][kvs_[i_]] = kvs_[i_ + 1];
            }
        }
    }

    /// @inheritdoc IInterpreterStoreV1
    function get(
        FullyQualifiedNamespace namespace_,
        uint256 key_
    ) external view returns (uint256) {
        return store[namespace_][key_];
    }
}
