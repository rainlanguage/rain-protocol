// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/run/LibInterpreterState.sol";
import "../../../../interpreter/run/LibStackTop.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../type/LibCast.sol";
import "../../../../array/LibUint256Array.sol";

/// @title LibInterpreterStateTest
/// Test wrapper around `LibInterpreterState` library.
contract LibInterpreterStateTest is RainInterpreter {
    using LibInterpreterState for InterpreterState;
    using LibInterpreterState for bytes;
    using LibInterpreterState for StateConfig;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibCast for function(InterpreterState memory, Operand, StackTop)
        view
        returns (StackTop)[];
    using LibConvert for uint256[];

    address internal immutable interpreterIntegrity;

    constructor(address interpreterIntegrity_) {
        interpreterIntegrity = interpreterIntegrity_;
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

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

    function debug(
        StateConfig memory config_,
        uint256[][] memory context_,
        DebugStyle debugStyle_,
        SourceIndex sourceIndex_,
        uint[] memory minStackOutputs_
    ) external view returns (StackTop stackTop_, StackTop stackTopAfter_) {
        InterpreterState memory deserialized_ = serDeserialize(
            config_,
            context_,
            minStackOutputs_
        );
        stackTop_ = deserialized_.eval(sourceIndex_, deserialized_.stackBottom);
        stackTopAfter_ = deserialized_.debug(stackTop_, debugStyle_);
    }

    function serDeserialize(
        StateConfig memory config_,
        uint256[][] memory context_,
        uint[] memory minStackOutputs_
    ) public view returns (InterpreterState memory state_) {
        bytes memory serialized_ = serialize(config_, minStackOutputs_);
        state_ = serialized_.deserialize();
        state_.context = context_;
    }

    function serialize(
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) public view returns (bytes memory serialized_) {
        (
            ,
            uint256 stackLength_
        ) = IRainInterpreterIntegrity(interpreterIntegrity).ensureIntegrity(
                config_.sources,
                config_.constants.length,
                minStackOutputs_
            );

        serialized_ = config_.serialize(
            stackLength_,
            opcodeFunctionPointers().asUint256Array().unsafeTo16BitBytes()
        );
    }

    function eval(
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) external view returns (StackTop stackTopAfter_, uint256 stackBottom_) {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0), // context,
            minStackOutputs_
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(SourceIndex.wrap(0), state_.stackBottom);
    }

    function eval(
        StateConfig memory config_,
        SourceIndex sourceIndex_,
        uint[] memory minStackOutputs_
    ) external view returns (StackTop stackTopAfter_, uint256 stackBottom_) {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0), // context
            minStackOutputs_
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom);
    }

    function evalStackTop(
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) external view returns (StackTop stackTopAfter_, uint256 stackBottom_) {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0), // context
            minStackOutputs_
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(SourceIndex.wrap(0), state_.stackBottom); // just use normal stackBottom for testing
    }

    function evalStackTop(
        StateConfig memory config_,
        SourceIndex sourceIndex_,
        uint[] memory minStackOutputs_
    ) external view returns (StackTop stackTopAfter_, uint256 stackBottom_) {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0), // context
            minStackOutputs_
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom); // just use normal stackBottom for testing
    }
}
