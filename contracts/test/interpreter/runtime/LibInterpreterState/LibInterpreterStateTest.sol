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
    using LibInterpreterState for ExpressionConfig;
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibCast for function(InterpreterState memory, Operand, StackPointer)
        view
        returns (StackPointer)[];
    using LibConvert for uint256[];

    constructor() {}

    function debug(
        ExpressionConfig memory config_,
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
        ExpressionConfig memory config_,
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
        ExpressionConfig memory config_,
        uint256 stackLength_
    ) public view returns (bytes memory) {
        bytes memory serialized_ = config_.serialize(
            stackLength_,
            interpreter_.functionPointers()
        );
        return serialized_;
    }
}
