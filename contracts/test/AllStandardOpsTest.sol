// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH, SourceAnalysis} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
import {LogicOps} from "../vm/ops/math/LogicOps.sol";
import "../vm/ops/AllStandardOps.sol";

import "hardhat/console.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title StandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is RainVM, VMState {
    using Dispatch for DispatchTable;

    address private immutable vmStatePointer;

    State private _state;

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

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function stackTop() external view returns (uint256) {
        return _state.stack[_state.stackIndex - 1];
    }

    function stack() external view returns (uint256[] memory) {
        return _state.stack;
    }

    function state() external view returns (State memory) {
        return _state;
    }

    function fnPtrs() external view returns (uint256[] memory) {
        DispatchTable dispatchTable_ = AllStandardOps.dispatchTable();
        return dispatchTable_.fnPtrs();
    }

    /// Runs `eval` and stores full state.
    function run(uint256[] memory fnPtrs_) public {
        DispatchTable dispatchTable_;
        dispatchTable_ = dispatchTable_.initialize(fnPtrs_);
        State memory state_ = _restore(vmStatePointer);
        uint256 startGas_ = gasleft();
        eval(dispatchTable_, "", state_, SOURCE_INDEX);
        uint256 endGas_ = gasleft();
        console.log("logic eval gas used: %s", startGas_ - endGas_);
        _state = state_;
    }
}
