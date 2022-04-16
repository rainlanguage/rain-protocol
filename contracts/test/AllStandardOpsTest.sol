// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import {LogicOps} from "../vm/ops/math/LogicOps.sol";
import "../vm/ops/AllStandardOps.sol";
import "../vm/VMMeta.sol";

import "hardhat/console.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title StandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is RainVM {
    using LibDispatchTable for DispatchTable;

    address private vmStatePointer;

    State private _state;

    function initialize(bytes calldata stateBytes_) external {
        vmStatePointer = SSTORE2.write(stateBytes_);
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
        uint a_ = gasleft();
        State memory state_ = LibState.fromBytes(SSTORE2.read(vmStatePointer));
        uint b_ = gasleft();
        console.log("load logic:", a_ - b_);
        uint c_ = gasleft();
        eval("", state_, SOURCE_INDEX);
        uint d_ = gasleft();
        console.log("run logic:", c_ - d_);

        // Never actually do this, state is gigantic so can't live in storage.
        _state = state_;
    }
}
