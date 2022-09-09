// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/LibInterpreter.sol";
import "../../../../interpreter/LibStackTop.sol";
import {StandardInterpreter} from "../../../../interpreter/StandardInterpreter.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../type/LibCast.sol";
import "../../../../array/LibUint256Array.sol";

uint256 constant DEFAULT_MIN_FINAL_STACK = 1;

/// @title LibInterpreterTest
/// Test wrapper around `LibInterpreter` library.
contract LibInterpreterTest is StandardInterpreter {
    using LibInterpreter for InterpreterState;
    using LibInterpreter for bytes;
    using LibInterpreter for StateConfig;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;

    constructor(address interpreterIntegrity_) StandardInterpreter(interpreterIntegrity_) {
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        override
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc StandardInterpreter
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
        SourceIndex sourceIndex_
    ) external view returns (StackTop stackTop_, StackTop stackTopAfter_) {
        InterpreterState memory deserialized_ = serDeserialize(config_, context_);
        stackTop_ = deserialized_.eval(sourceIndex_);
        stackTopAfter_ = deserialized_.debug(stackTop_, debugStyle_);
    }

    function serDeserialize(
        StateConfig memory config_,
        uint256[][] memory context_
    ) public view returns (InterpreterState memory state_) {
        bytes memory serialized_ = serialize(config_);
        state_ = serialized_.deserialize(context_);
    }

    function serialize(StateConfig memory config_)
        public
        view
        returns (bytes memory serialized_)
    {
        (uint256 scratch_, uint256 stackLength_) = IExpressionDeployer(interpreterIntegrity)
            .ensureIntegrity(
                config_.sources,
                config_.constants.length,
                DEFAULT_MIN_FINAL_STACK.arrayFrom()
            );

        serialized_ = config_.serialize(
            scratch_,
            stackLength_,
            opcodeFunctionPointers()
        );
    }

    function eval(StateConfig memory config_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval();
    }

    function eval(StateConfig memory config_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_);
    }

    function evalStackTop(StateConfig memory config_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(state_.stackBottom); // just use normal stackBottom for testing
    }

    function evalStackTop(StateConfig memory config_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        InterpreterState memory state_ = serDeserialize(
            config_,
            new uint256[][](0) // context
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom); // just use normal stackBottom for testing
    }
}
