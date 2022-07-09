// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import "../vm/ops/AllStandardOps.sol";
import "../vm/VMStateBuilder.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 1;

uint256 constant STORAGE_OPCODES_LENGTH = 3;

/// @title AllStandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is RainVM {
    address private immutable self;
    address private immutable vmStateBuilder;
    address private vmStatePointer;

    /// *** STORAGE OPCODES START ***

    uint256 private _val0 = 0;
    uint256 private _val1 = 1;
    uint256 private _val2 = 2;
    uint256 private _val3 = 3; // deliberately not in range

    /// *** STORAGE OPCODES END ***

    State private _state;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        uint256 a_ = gasleft();
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        uint256 b_ = gasleft();
        console.log("pre new state gas", a_ - b_);

        a_ = gasleft();
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            stateConfig_,
            boundss_
        );
        b_ = gasleft();
        console.log("new state gas", a_ - b_);
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

    function fnPtrs() public pure override returns (uint256[] memory) {
        return AllStandardOps.fnPtrs(new uint256[](0));
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
        eval("", state_, ENTRYPOINT);
        uint256 f_ = gasleft();
        console.log("load gas:", a_ - b_);
        console.log("decode gas:", c_ - d_);
        console.log("run gas:", e_ - f_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _state = state_;
    }

    /// Runs `eval` and stores full state. Stores `values_` to be accessed later
    /// via CONTEXT opcode.
    /// @param values_ - Values to add to context.
    function runContext(uint256[] memory values_) public {
        bytes memory context_ = new bytes(0x20 * values_.length);
        for (uint256 i_ = 0; i_ < values_.length; i_++) {
            uint256 value_ = values_[i_];
            uint256 offset_ = i_ * 0x20;
            assembly {
                mstore(add(add(context_, offset_), 0x20), value_)
            }
        }
        uint256 a_ = gasleft();
        bytes memory stateBytes_ = SSTORE2.read(vmStatePointer);
        uint256 b_ = gasleft();
        uint256 c_ = gasleft();
        State memory state_ = LibState.fromBytesPacked(stateBytes_);
        uint256 d_ = gasleft();
        uint256 e_ = gasleft();
        eval(context_, state_, ENTRYPOINT);
        uint256 f_ = gasleft();
        console.log("load gas:", a_ - b_);
        console.log("decode gas:", c_ - d_);
        console.log("run gas:", e_ - f_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _state = state_;
    }

    function storageOpcodesRange()
        public
        pure
        override
        returns (StorageOpcodesRange memory)
    {
        uint256 pointer_;
        assembly {
            pointer_ := _val0.slot
        }
        return StorageOpcodesRange(pointer_, STORAGE_OPCODES_LENGTH);
    }
}
