// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
// solhint-disable-next-line max-line-length
import {EVMConstantOps, EVM_CONSTANT_OPS_LENGTH} from "../vm/ops/evm/EVMConstantOps.sol";

/// @title StackOverflowTest
/// Simple calculator that exposes basic math ops and block ops for testing.
contract StackOverflowTest is RainVM, VMState {
    uint256 internal constant LOCAL_OPS_LENGTH = 1;

    uint256 private immutable evmConstantOpsStart;
    uint256 private immutable localOpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        evmConstantOpsStart = RAIN_VM_OPS_LENGTH;
        localOpsStart = evmConstantOpsStart + EVM_CONSTANT_OPS_LENGTH;
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
            if (opcode_ < localOpsStart) {
                EVMConstantOps.applyOp(
                    state_,
                    opcode_ - evmConstantOpsStart,
                    operand_
                );
            } else {
                opcode_ -= localOpsStart;
                require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
                // There's only one opcode, which causes stack overflow.
                state_.stackIndex = state_.stack.length + 1;
            }
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
