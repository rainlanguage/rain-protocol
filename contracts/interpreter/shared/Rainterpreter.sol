// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpGet.sol";
import "../../kv/LibMemoryKV.sol";
import "../../sstore2/SSTORE2.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

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
    using LibInterpreterState for StateNamespace;
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];
    using LibConvert for uint256[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;

    /// State is several tiers of sandbox.
    ///
    /// 0. address is msg.sender so that callers cannot attack each other
    /// 1. StateNamespace is caller-provided namespace so that expressions cannot
    ///    attack each other
    /// 2. uint256 is expression-provided key
    /// 3. uint256 is expression-provided value
    ///
    /// tiers 0 and 1 are both embodied in the `FullyQualifiedNamespace`.
    mapping(FullyQualifiedNamespace => mapping(uint256 => uint256))
        internal state;

    function staticEval(
        FullyQualifiedNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external view returns (uint256[] memory, uint256[] memory) {
        require(msg.sender == address(this), "NOT_THIS");
        (
            address expression_,
            SourceIndex sourceIndex_,
            uint256 maxOutputs_
        ) = LibEncodedDispatch.decode(dispatch_);
        InterpreterState memory state_ = SSTORE2
            .read(expression_)
            .deserialize();
        state_.namespace = namespace_;
        state_.context = context_;
        StackPointer stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(
            stackLength_.min(maxOutputs_)
        );
        return (tail_, state_.stateKV.toUint256Array());
    }

    function evalWithNamespace(
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] calldata context_
    ) public view returns (uint256[] memory, uint256[] memory) {
        return
            this.staticEval(namespace_.qualifyNamespace(), dispatch_, context_);
    }

    function eval(
        EncodedDispatch dispatch_,
        uint256[][] calldata context_
    ) external view returns (uint256[] memory, uint256[] memory) {
        return evalWithNamespace(StateNamespace.wrap(0), dispatch_, context_);
    }

    function stateChangesWithNamespace(
        StateNamespace namespace_,
        uint256[] calldata stateChanges_
    ) public {
        FullyQualifiedNamespace fullyQualifiedNamespace_ = namespace_
            .qualifyNamespace();
        unchecked {
            for (uint256 i_ = 0; i_ < stateChanges_.length; i_ += 2) {
                state[fullyQualifiedNamespace_][
                    stateChanges_[i_]
                ] = stateChanges_[i_ + 1];
            }
        }
    }

    function stateChanges(uint256[] calldata stateChanges_) external {
        stateChangesWithNamespace(StateNamespace.wrap(0), stateChanges_);
    }

    function functionPointers() external view returns (bytes memory) {
        return opcodeFunctionPointers().asUint256Array().unsafeTo16BitBytes();
    }

    function opGet(
        InterpreterState memory interpreterState_,
        Operand,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        uint256 k_;
        (stackTop_, k_) = stackTop_.pop();
        MemoryKVPtr kvPtr_ = interpreterState_.stateKV.getPtr(
            MemoryKVKey.wrap(k_)
        );
        uint256 v_ = 0;
        if (MemoryKVPtr.unwrap(kvPtr_) > 0) {
            v_ = MemoryKVVal.unwrap(kvPtr_.readPtrVal());
        } else {
            v_ = state[interpreterState_.namespace][k_];
        }
        return stackTop_.push(v_);
    }

    function localIntegrityFunctionPointers()
        internal
        pure
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
            memory localPtrs_ = new function(
                IntegrityCheckState memory,
                Operand,
                StackPointer
            ) view returns (StackPointer)[](1);
        localPtrs_[0] = OpGet.integrity;
        return localPtrs_;
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory
        )
    {
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory localPtrs_ = new function(
                InterpreterState memory,
                Operand,
                StackPointer
            ) view returns (StackPointer)[](1);
        localPtrs_[0] = opGet;
        return localPtrs_;
    }

    /// Internal function to produce all the function pointers for opcodes that
    /// will be returned by `functionPointers`. Inheriting contracts MAY override
    /// this to rebuild the function pointers list from scratch, which MAY
    /// include some or none of the opcodes from the default list.
    /// @return A list of opcode function pointers.
    function opcodeFunctionPointers()
        internal
        view
        virtual
        returns (
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }
}
