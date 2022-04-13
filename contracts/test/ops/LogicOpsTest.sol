// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH, SourceAnalysis} from "../../vm/RainVM.sol";
import {VMState, StateConfig} from "../../vm/libraries/VMState.sol";
import {LogicOps} from "../../vm/ops/math/LogicOps.sol";
import "../../vm/ops/AllStandardOps.sol";

import "hardhat/console.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title StandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract StandardOpsTest is RainVM, VMState {
    address private immutable vmStatePointer;

    State public state;

    constructor(StateConfig memory config_) {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, config_.sources, SOURCE_INDEX);
        vmStatePointer = _snapshot(_newState(config_, sourceAnalysis_));
    }

    /// @inheritdoc RainVM
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        public
        view
        virtual
        override
        returns (int256)
    {
            return AllStandardOps.stackIndexDiff(opcode_, operand_);
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override returns (uint256) {
            return AllStandardOps.applyOp(stackTopLocation_, opcode_, operand_);
    }

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function stackTop() external view returns (uint256) {
        return state.stack[state.stackIndex - 1];
    }

    function stack() external view returns (uint[] memory) {
        return state.stack;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        State memory state_ = _restore(vmStatePointer);
        uint startGas_ = gasleft();
        eval("", state_, SOURCE_INDEX);
        uint endGas_ = gasleft();
        console.log("logic eval gas used: %s", startGas_ - endGas_);
        state = state_;
    }
}
