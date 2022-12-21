// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../ops/AllStandardOps.sol";
import "../run/LibEncodedDispatch.sol";
import "../ops/core/OpGet.sol";
import "../../kv/LibMemoryKV.sol";
import "../../sstore2/SSTORE2.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract Rainterpreter is IInterpreterV1 {
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
    //
    // 0. address is msg.sender so that callers cannot attack each other
    // 1. StateNamespace is caller-provided namespace so that expressions cannot attack each other
    // 2. uint is expression-provided key
    // 3. uint is expression-provided value
    //
    // tiers 0 and 1 are both embodied in the FullyQualifiedNamespace.
    mapping(FullyQualifiedNamespace => mapping(uint => uint)) internal state;

    function _qualifyNamespace(
        StateNamespace stateNamespace_
    ) internal view returns (FullyQualifiedNamespace) {
        return
            FullyQualifiedNamespace.wrap(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            msg.sender,
                            StateNamespace.unwrap(stateNamespace_)
                        )
                    )
                )
            );
    }

    function staticEval(
        FullyQualifiedNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external view returns (uint256[] memory, uint256[] memory) {
        require(msg.sender == address(this), "NOT_THIS");
        (
            address expression_,
            SourceIndex sourceIndex_,
            uint maxOutputs_
        ) = LibEncodedDispatch.decode(dispatch_);
        InterpreterState memory state_ = SSTORE2
            .read(expression_)
            .deserialize();
        state_.namespace = namespace_;
        state_.context = context_;
        StackTop stackTop_ = state_.eval(sourceIndex_, state_.stackBottom);
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
            this.staticEval(_qualifyNamespace(namespace_), dispatch_, context_);
    }

    function eval(
        EncodedDispatch dispatch_,
        uint256[][] calldata context_
    ) external view returns (uint256[] memory, uint256[] memory) {
        return evalWithNamespace(StateNamespace.wrap(0), dispatch_, context_);
    }

    function stateChangesWithNamespace(
        StateNamespace stateNamespace_,
        uint256[] calldata stateChanges_
    ) public {
        FullyQualifiedNamespace fullyQualifiedNamespace_ = _qualifyNamespace(
            stateNamespace_
        );
        unchecked {
            for (uint256 i_ = 0; i_ < stateChanges_.length; i_ += 2) {
                state[fullyQualifiedNamespace_][
                    stateChanges_[i_]
                ] = stateChanges_[i_ + 1];
            }
        }
    }

    function stateChanges(uint[] calldata stateChanges_) external {
        stateChangesWithNamespace(StateNamespace.wrap(0), stateChanges_);
    }

    function functionPointers() external view returns (bytes memory) {
        return opcodeFunctionPointers().asUint256Array().unsafeTo16BitBytes();
    }

    function opGet(
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
            v_ = state[interpreterState_.namespace][k_];
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
        localPtrs_[0] = OpGet.integrity;
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
        localPtrs_[0] = opGet;
        return localPtrs_;
    }

    function opcodeFunctionPointers()
        internal
        view
        virtual
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
