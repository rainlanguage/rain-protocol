// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
import {FixedPointMathOps} from "../vm/ops/math/FixedPointMathOps.sol";

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
        vmStatePointer = _snapshot(_newState(config_));
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            FixedPointMathOps.applyOp(
                state_,
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
        eval("", state_, 0);
        return state_;
    }
}
