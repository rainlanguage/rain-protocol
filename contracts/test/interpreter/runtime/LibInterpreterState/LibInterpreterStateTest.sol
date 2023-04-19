// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/run/LibInterpreterState.sol";
import "../../../../interpreter/run/LibStackPointer.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "sol.lib.memory/LibBytes.sol";
import "hardhat/console.sol";

/// @title LibInterpreterStateTest
/// Test wrapper around `LibInterpreterState` library.
contract LibInterpreterStateTest {
    using LibMemory for bytes;
    using LibInterpreterState for InterpreterState;
    using LibInterpreterState for bytes;
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibBytes for bytes;

    constructor() {}

    function serDeserialize(
        bytes[] memory sources_,
        uint256[] memory constants_,
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
            sources_,
            constants_,
            stackLength_
        );
        state_ = serialized_.deserialize();
        state_.context = context_;
    }

    function serialize(
        IInterpreterV1 interpreter_,
        bytes[] memory sources_,
        uint256[] memory constants_,
        uint256 stackLength_
    ) public view returns (bytes memory) {
        bytes memory serialized_ = new bytes(
            LibInterpreterState.serializeSize(
                sources_,
                constants_,
                stackLength_
            )
        );
        LibInterpreterState.serialize(
            serialized_.dataPointer(),
            sources_,
            constants_,
            stackLength_,
            interpreter_.functionPointers()
        );
        return serialized_;
    }
}
