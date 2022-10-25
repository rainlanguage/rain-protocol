// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {StandardInterpreter} from "../../../../interpreter/runtime/StandardInterpreter.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../interpreter/integrity/RainInterpreterIntegrity.sol";

uint256 constant STORAGE_OPCODES_LENGTH = 3;

/// @title AllStandardOpsTest
/// Simple contract that exposes all standard ops for testing.
contract AllStandardOpsTest is StandardInterpreter {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256;

    /// *** STORAGE OPCODES START ***

    uint256 private _val0 = 0;
    uint256 private _val1 = 1;
    uint256 private _val2 = 2;
    uint256 private _val3 = 3; // deliberately not in range

    /// *** STORAGE OPCODES END ***

    uint256[] private _stack;
    uint256 private _stackIndex;

    constructor(address interpreterIntegrity_)
        StandardInterpreter(interpreterIntegrity_)
    {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        _saveInterpreterState(stateConfig_);
    }

    function stackTop() external view returns (uint256) {
        return _stack[_stackIndex - 1];
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        InterpreterState memory state_ = _loadInterpreterState();
        uint256 a_ = gasleft();
        StackTop stackTop_ = state_.eval();
        uint256 b_ = gasleft();
        console.log("eval gas", a_ - b_);
        // Never actually do this, state is gigantic so can't live in storage.
        // This is just being done to make testing easier than trying to read
        // results from events etc.
        _stack = state_.stackBottom.down().asUint256Array();
        _stackIndex = state_.stackBottom.toIndex(stackTop_);
    }

    /// Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    function runContext(uint256[][] memory context_) public {
        InterpreterState memory state_ = _loadInterpreterState();
        state_.context = context_;
        StackTop stackTop_ = state_.eval();
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
