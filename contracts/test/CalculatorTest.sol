// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM, State, RAIN_VM_OPS_LENGTH, SourceAnalysis} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
// solhint-disable-next-line max-line-length
import {EVMConstantOps, EVM_CONSTANT_OPS_LENGTH} from "../vm/ops/evm/EVMConstantOps.sol";
import {MathOps} from "../vm/ops/math/MathOps.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title CalculatorTest
/// Simple calculator that exposes basic math ops and block ops for testing.
contract CalculatorTest is RainVM, VMState {
    uint256 private immutable evmConstantOpsStart;
    uint256 private immutable mathOpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        evmConstantOpsStart = RAIN_VM_OPS_LENGTH;
        mathOpsStart = evmConstantOpsStart + EVM_CONSTANT_OPS_LENGTH;
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, config_.sources, SOURCE_INDEX);
        vmStatePointer = _snapshot(_newState(config_, sourceAnalysis_));
    }

    /// @inheritdoc RainVM
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        public
        view
        override
        returns (int256)
    {
        unchecked {
            if (opcode_ < mathOpsStart) {
                return
                    EVMConstantOps.stackIndexDiff(
                        opcode_ - evmConstantOpsStart,
                        operand_
                    );
            } else {
                return MathOps.stackIndexDiff(opcode_ - mathOpsStart, operand_);
            }
        }
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override returns (uint256) {
        unchecked {
            if (opcode_ < mathOpsStart) {
                return
                    EVMConstantOps.applyOp(
                        stackTopLocation_,
                        opcode_ - evmConstantOpsStart,
                        operand_
                    );
            } else {
                return
                    MathOps.applyOp(
                        stackTopLocation_,
                        opcode_ - mathOpsStart,
                        operand_
                    );
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
        eval("", state_, SOURCE_INDEX);
        return state_;
    }
}
