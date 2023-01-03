// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/run/LibInterpreterState.sol";
import "../../../../interpreter/run/LibStackPointer.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../type/LibCast.sol";
import "../../../../array/LibUint256Array.sol";
import "hardhat/console.sol";

/// @title LibInterpreterStateTest
/// Test wrapper around `LibInterpreterState` library.
contract LibInterpreterStateTest {
    using LibInterpreterState for InterpreterState;
    using LibInterpreterState for bytes;
    using LibInterpreterState for StateConfig;
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];
    using LibConvert for uint256[];

    constructor() {}

    function debug(
        StateConfig memory config_,
        uint256 stackLength_,
        uint256[][] memory context_,
        DebugStyle debugStyle_,
        IInterpreterV1 interpreter_
    )
        external
        view
        returns (StackPointer stackTop_, StackPointer stackTopAfter_)
    {
        InterpreterState memory state_;
        bytes memory serialized_ = serialize(
            interpreter_,
            config_,
            stackLength_
        );
        state_ = serialized_.deserialize();
        state_.context = context_;
        stackTop_ = state_.stackBottom;
        stackTopAfter_ = state_.debug(stackTop_.up(stackLength_), debugStyle_);
    }

    function serDeserialize(
        StateConfig memory config_,
        uint256 stackLength_,
        uint256[][] memory context_,
        IInterpreterV1 interpreter_
    ) public view returns (InterpreterState memory state_) {
        // TODO FIXME
        // bytes memory serialized_ = serialize(config_, minStackOutputs_);
        // state_ = serialized_.deserialize();
        //state_.context = context_;

        bytes memory serialized_ = serialize(
            interpreter_,
            config_,
            stackLength_
        );
        state_ = serialized_.deserialize();
        state_.context = context_;
    }

    function serialize(
        IInterpreterV1 interpreter_,
        StateConfig memory config_,
        uint256 stackLength_
    )
        public
        view
        returns (
            // uint256[] memory minStackOutputs_
            bytes memory serialized_
        )
    {
        // (, uint256 stackLength_) = IRainInterpreterIntegrity(
        //     interpreterIntegrity
        // ).ensureIntegrity(
        //         config_.sources,
        //         config_.constants.length,
        //         minStackOutputs_
        //     );

        serialized_ = config_.serialize(
            stackLength_,
            interpreter_.functionPointers()
        );
    }

    // function eval(
    //     StateConfig memory config_,
    //     uint256[] memory minStackOutputs_
    // )
    //     external
    //     view
    //     returns (StackPointer stackTopAfter_, uint256 stackBottom_)
    // {
    //     InterpreterState memory state_ = serDeserialize(
    //         config_,
    //         new uint256[][](0), // context,
    //         minStackOutputs_
    //     );

    //     stackBottom_ = StackPointer.unwrap(state_.stackBottom);
    //     stackTopAfter_ = state_.eval(SourceIndex.wrap(0), state_.stackBottom);
    // }

    // function eval(
    //     StateConfig memory config_,
    //     SourceIndex sourceIndex_,
    //     uint256[] memory minStackOutputs_
    // )
    //     external
    //     view
    //     returns (StackPointer stackTopAfter_, uint256 stackBottom_)
    // {
    //     InterpreterState memory state_ = serDeserialize(
    //         config_,
    //         new uint256[][](0), // context
    //         minStackOutputs_
    //     );

    //     stackBottom_ = StackPointer.unwrap(state_.stackBottom);
    //     stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom);
    // }

    // function evalStackPointer(
    //     StateConfig memory config_,
    //     uint256[] memory minStackOutputs_
    // )
    //     external
    //     view
    //     returns (StackPointer stackTopAfter_, uint256 stackBottom_)
    // {
    //     InterpreterState memory state_ = serDeserialize(
    //         config_,
    //         new uint256[][](0), // context
    //         minStackOutputs_
    //     );

    //     stackBottom_ = StackPointer.unwrap(state_.stackBottom);
    //     stackTopAfter_ = state_.eval(SourceIndex.wrap(0), state_.stackBottom); // just use normal stackBottom for testing
    // }

    // function evalStackPointer(
    //     StateConfig memory config_,
    //     SourceIndex sourceIndex_,
    //     uint256[] memory minStackOutputs_
    // )
    //     external
    //     view
    //     returns (StackPointer stackTopAfter_, uint256 stackBottom_)
    // {
    //     InterpreterState memory state_ = serDeserialize(
    //         config_,
    //         new uint256[][](0), // context
    //         minStackOutputs_
    //     );

    //     stackBottom_ = StackPointer.unwrap(state_.stackBottom);
    //     stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom); // just use normal stackBottom for testing
    // }
}
