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
    using LibUint256Array for uint256;

    /// *** STORAGE OPCODES START ***

    uint256 private _val0 = 0;
    uint256 private _val1 = 1;
    uint256 private _val2 = 2;
    uint256 private _val3 = 3; // deliberately not in range

    /// *** STORAGE OPCODES END ***

    uint256[] private _stack;
    uint256 private _stackIndex;

    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {}

    function _saveVMState(
        StateConfig memory config_,
        uint256[] memory finalStacks_
    ) internal virtual override {
        uint256 a_ = gasleft();
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder)
            .buildStateBytes(self, config_, finalStacks_);
        uint256 b_ = gasleft();
        console.log("state build gas: %s", a_ - b_);
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        _saveVMState(stateConfig_, MIN_FINAL_STACK_INDEX.arrayFrom());
    }

    function stackTop() external view returns (uint256) {
        return _stack[_stackIndex - 1];
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        VMState memory state_ = _loadVMState(new uint256[](0));
        uint256 a_ = gasleft();
        StackTop stackTop_ = eval(state_, ENTRYPOINT, state_.stackBottom);
        uint256 b_ = gasleft();
        console.log("eval", a_ - b_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _stack = state_.stackBottom.down().asUint256Array();
        _stackIndex = state_.stackBottom.toIndex(stackTop_);
    }

    /// Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    function runContext(uint256[] memory context_) public {
        VMState memory state_ = _loadVMState(context_);
        StackTop stackTop_ = eval(state_, ENTRYPOINT, state_.stackBottom);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _stack = state_.stackBottom.down().asUint256Array();
        _stackIndex = state_.stackBottom.toIndex(stackTop_);
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
