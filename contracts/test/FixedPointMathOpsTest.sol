// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
import {FixedPointMathOps} from "../vm/ops/math/FixedPointMathOps.sol";

uint constant SOURCE_INDEX = 0;

/// @title FixedPointMathOpsTest
/// Simple contract that exposes fixed point math ops for testing.
contract FixedPointMathOpsTest is RainVM, VMState {
    uint256 private immutable fixedPointMathOpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        fixedPointMathOpsStart = RAIN_VM_OPS_LENGTH;
        vmStatePointer = _snapshot(_newState(RainVM(this), config_, SOURCE_INDEX));
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override returns (uint) {
        unchecked {
            return FixedPointMathOps.applyOp(
                stackTopLocation_,
                opcode_ - fixedPointMathOpsStart,
                operand_
            );
        }
    }

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function run() external view returns (uint256) {
        State memory state_ = runState();
        return state_.stack[state_.stackIndex - 1];
    }

    /// Runs `eval` and returns full state.
    /// @return `State` after running own immutable source.
    function runState() public view returns (State memory) {
        State memory state_ = _restore(vmStatePointer);
        eval("", state_, SOURCE_INDEX);
        return state_;
    }
}
