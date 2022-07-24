// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {StandardVM} from "../vm/StandardVM.sol";
import "../vm/ops/AllStandardOps.sol";
import "../vm/VMStateBuilder.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 1;

uint256 constant STORAGE_OPCODES_LENGTH = 3;

/// @title AllStandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is StandardVM {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    /// *** STORAGE OPCODES START ***

    uint256 private _val0 = 0;
    uint256 private _val1 = 1;
    uint256 private _val2 = 2;
    uint256 private _val3 = 3; // deliberately not in range

    /// *** STORAGE OPCODES END ***

    VMState private _state;
    uint256 private _stackIndex;

    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;

        _saveVMState(stateConfig_, boundss_);
    }

    function stackTop() external view returns (uint256) {
        return _state.stack[_stackIndex - 1];
    }

    function stack() external view returns (uint256[] memory) {
        return _state.stack;
    }

    function state() external view returns (VMState memory) {
        return _state;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        VMState memory state_ = _loadVMState(new uint256[](0));
        uint256 a_ = gasleft();
        StackTop stackTop_ = eval(
            state_,
            ENTRYPOINT,
            state_.stack.asStackTopUp()
        );
        uint256 b_ = gasleft();
        console.log("eval", a_ - b_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _state = state_;
        _stackIndex = state_.stackTopToIndex(stackTop_);
    }

    /// Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    function runContext(uint256[] memory context_) public {
        VMState memory state_ = _loadVMState(context_);
        StackTop stackTop_ = eval(
            state_,
            ENTRYPOINT,
            state_.stack.asStackTopUp()
        );
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _state = state_;
        _stackIndex = state_.stackTopToIndex(stackTop_);
    }

    function storageOpcodesRange()
        public
        pure
        override
        returns (StorageOpcodesRange memory storageOpcodesRange_)
    {
        uint256 pointer_;
        assembly ("memory-safe") {
            pointer_ := _val0.slot
        }
        storageOpcodesRange_ = StorageOpcodesRange(
            pointer_,
            STORAGE_OPCODES_LENGTH
        );
    }
}
