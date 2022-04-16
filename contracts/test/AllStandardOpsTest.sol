// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import {LogicOps} from "../vm/ops/math/LogicOps.sol";
import "../vm/ops/AllStandardOps.sol";
import "../vm/VMMeta.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title StandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is RainVM {
    using LibDispatchTable for DispatchTable;

    VMMeta private immutable vmMeta;
    address private vmStatePointer;

    State private _state;

    constructor(address vmMeta_) {
        vmMeta = VMMeta(vmMeta_);
    }

    function initialize(StateConfig memory config_) external {
        vmStatePointer = vmMeta._newPointer(
            address(this),
            config_,
            SOURCE_INDEX
        );
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

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.dispatchTableBytes();
    }

    /// Runs `eval` and stores full state.
    function run() public {
        State memory state_ = LibState.fromBytes(SSTORE2.read(vmStatePointer));
        eval("", state_, SOURCE_INDEX);
        _state = state_;
    }
}
