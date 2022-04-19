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
    address private vmStatePointer;

    State private _state;

    constructor(address vmMeta_) RainVM(vmMeta_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        uint a_ = gasleft();
        bytes memory stateBytes_ = VMMeta(vmMeta).newStateBytes(
            address(this),
            stateConfig_,
            SOURCE_INDEX
        );
        uint b_ = gasleft();
        console.log("new state gas", a_ - b_);
        uint c_ = gasleft();
        vmStatePointer = SSTORE2.write(stateBytes_);
        uint d_ = gasleft();
        console.log("write gas", c_ - d_);
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
        return AllStandardOps.fnPtrs();
    }

    /// Runs `eval` and stores full state.
    function run() public {
        uint256 a_ = gasleft();
        bytes memory stateBytes_ = SSTORE2.read(vmStatePointer);
        uint256 b_ = gasleft();
        uint256 c_ = gasleft();
        State memory state_ = LibState.fromBytesPacked(stateBytes_);
        uint256 d_ = gasleft();
        uint256 e_ = gasleft();
        eval("", state_, SOURCE_INDEX);
        uint256 f_ = gasleft();
        console.log("load gas:", a_ - b_);
        console.log("decode gas:", c_ - d_);
        console.log("run gas:", e_ - f_);
        // Never actually do this, state is gigantic so can't live in storage.
        _state = state_;
    }
}
