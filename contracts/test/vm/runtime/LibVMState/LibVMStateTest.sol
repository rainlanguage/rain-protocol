// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../vm/runtime/LibVMState.sol";
import "../../../../vm/runtime/LibStackTop.sol";
import "../../../../vm/ops/AllStandardOps.sol";
import "../../../../type/LibCast.sol";
import "../../../../array/LibUint256Array.sol";

uint256 constant DEFAULT_MIN_FINAL_STACK = 1;

/// @title LibVMStateTest
/// Test wrapper around `LibVMState` library.
contract LibVMStateTest is RainVM {
    using LibVMState for VMState;
    using LibVMState for bytes;
    using LibVMState for StateConfig;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;

    address internal immutable vmIntegrity;

    constructor(address vmIntegrity_) {
        vmIntegrity = vmIntegrity_;
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainVM
    function opcodeFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }

    function debug(
        StateConfig memory config_,
        uint256[] memory context_,
        DebugStyle debugStyle_,
        SourceIndex sourceIndex_
    ) external view returns (StackTop stackTop_, StackTop stackTopAfter_) {
        VMState memory deserialized_ = serDeserialize(config_, context_);
        stackTop_ = deserialized_.eval(sourceIndex_);
        stackTopAfter_ = deserialized_.debug(stackTop_, debugStyle_);
    }

    function serDeserialize(
        StateConfig memory config_,
        uint256[] memory context_
    ) public view returns (VMState memory state_) {
        bytes memory serialized_ = serialize(config_);
        state_ = serialized_.deserialize(context_);
    }

    function serialize(StateConfig memory config_)
        public
        view
        returns (bytes memory serialized_)
    {
        (uint256 stackLength_, ) = IRainVMIntegrity(vmIntegrity)
            .ensureIntegrity(
                storageOpcodesRange(),
                config_.sources,
                config_.constants.length,
                DEFAULT_MIN_FINAL_STACK.arrayFrom()
            );

        serialized_ = config_.serialize(stackLength_, opcodeFunctionPointers());
    }

    function eval(StateConfig memory config_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        VMState memory state_ = serDeserialize(
            config_,
            new uint256[](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval();
    }

    function eval(StateConfig memory config_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        VMState memory state_ = serDeserialize(
            config_,
            new uint256[](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_);
    }

    function evalStackTop(StateConfig memory config_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        VMState memory state_ = serDeserialize(
            config_,
            new uint256[](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(state_.stackBottom); // just use normal stackBottom for testing
    }

    function evalStackTop(StateConfig memory config_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        VMState memory state_ = serDeserialize(
            config_,
            new uint256[](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom); // just use normal stackBottom for testing
    }
}
