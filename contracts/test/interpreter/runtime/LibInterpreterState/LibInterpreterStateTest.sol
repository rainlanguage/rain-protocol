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
        IInterpreterV1 interpreter_,
        StateConfig memory config_,
        uint256[][] memory context_,
        DebugStyle debugStyle_,
        SourceIndex sourceIndex_,
        uint256 maxStackLength
    )
        external
        view
        returns (StackPointer stackTop_, StackPointer stackTopAfter_)
    {
        InterpreterState memory deserialized_ = serDeserialize(
            interpreter_,
            config_,
            context_,
            maxStackLength
        );
        stackTop_ = deserialized_.eval(sourceIndex_, deserialized_.stackBottom);
        stackTopAfter_ = deserialized_.debug(stackTop_, debugStyle_);
    }

    function serDeserialize(
        IInterpreterV1 interpreter_,
        StateConfig memory config_,
        uint256[][] memory context_,
        uint256 maxStackLength
    ) public view returns (InterpreterState memory state_) {

        bytes memory serialized_ = serialize(interpreter_, config_, maxStackLength);
        state_ = serialized_.deserialize();
        state_.context = context_;
    }

    function serialize(
        IInterpreterV1 interpreter_,
        StateConfig memory config_,
        uint256 maxStackLength
    )
        public
        view
        returns (
            bytes memory serialized_
        )
    {
        serialized_ = config_.serialize(
            maxStackLength,
            interpreter_.functionPointers()
        );
    }
}
