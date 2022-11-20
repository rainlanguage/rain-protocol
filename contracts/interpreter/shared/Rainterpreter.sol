// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../run/RainInterpreter.sol";
import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpReadState.sol";
import "../../kv/LibMemoryKV.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract Rainterpreter is IInterpreterV1, RainInterpreter {
    using LibStackTop for StackTop;
    using LibInterpreterState for bytes;
    using LibInterpreterState for InterpreterState;
    using LibCast for function(InterpreterState memory, Operand, StackTop)
        view
        returns (StackTop)[];
    using LibConvert for uint256[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;

    // state is several tiers of sandbox
    // 0. address is msg.sender so that callers cannot attack each other
    // 1. StateNamespace is caller-provided namespace so that expressions cannot attack each other
    // 2. uint is expression-provided key
    // 3. uint is expression-provided value
    mapping(address => mapping(StateNamespace => mapping(uint => uint)))
        internal state;

    function evalWithNamespace(
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) public view returns (uint256[] memory, uint[] memory) {
        (
            address expression_,
            SourceIndex sourceIndex_,
            uint maxOutputs_
        ) = LibEncodedDispatch.decode(dispatch_);
        InterpreterState memory state_ = SSTORE2
            .read(expression_)
            .deserialize();
        state_.stateNamespace = namespace_;
        state_.context = context_;
        StackTop stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
        uint256 stackLength_ = state_.stackBottom.toIndex(stackTop_);
        (, uint256[] memory tail_) = stackTop_.list(
            stackLength_.min(maxOutputs_)
        );
        return (tail_, state_.stateKV.toUint256Array());
    }

    function eval(
        EncodedDispatch dispatch_,
        uint[][] memory context_
    ) external view returns (uint[] memory, uint[] memory) {
        return evalWithNamespace(StateNamespace.wrap(0), dispatch_, context_);
    }

    function stateChangesWithNamespace(
        StateNamespace stateNamespace_,
        uint[] memory stateChanges_
    ) public {
        unchecked {
            for (uint i_ = 0; i_ < stateChanges_.length; i_++) {
                state[msg.sender][stateNamespace_][
                    stateChanges_[i_]
                ] = stateChanges_[i_ + 1];
            }
        }
    }

    function stateChanges(uint[] memory stateChanges_) external {
        stateChangesWithNamespace(StateNamespace.wrap(0), stateChanges_);
    }

    function functionPointers() external view returns (bytes memory) {
        return opcodeFunctionPointers().asUint256Array().unsafeTo16BitBytes();
    }

    function opReadState(
        InterpreterState memory interpreterState_,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint k_;
        (stackTop_, k_) = stackTop_.pop();
        MemoryKVPtr kvPtr_ = interpreterState_.stateKV.getPtr(
            MemoryKVKey.wrap(k_)
        );
        uint v_ = 0;
        if (MemoryKVPtr.unwrap(kvPtr_) > 0) {
            v_ = MemoryKVVal.unwrap(kvPtr_.readPtrVal());
        } else {
            v_ = state[msg.sender][interpreterState_.stateNamespace][k_];
        }
        return stackTop_.push(v_);
    }

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory localPtrs_ = new function(
                IntegrityState memory,
                Operand,
                StackTop
            ) view returns (StackTop)[](1);
        localPtrs_[0] = OpReadState.integrity;
        return localPtrs_;
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(InterpreterState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory localPtrs_ = new function(
                InterpreterState memory,
                Operand,
                StackTop
            ) view returns (StackTop)[](1);
        localPtrs_[0] = opReadState;
        return localPtrs_;
    }

    /// @inheritdoc RainInterpreter
    function opcodeFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }
}
