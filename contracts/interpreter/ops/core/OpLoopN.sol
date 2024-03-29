// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "./OpCall.sol";

/// Thrown if there are fewer outputs than inputs which is currently unsupported.
error InsufficientLoopOutputs(uint256 inputs, uint256 outputs);

/// @title OpLoopN
/// @notice Opcode for looping a static number of times. A thin wrapper around
/// `OpCall` with the 4 high bits as a number of times to loop. Each iteration
/// will use the outputs of the previous iteration as its inputs so the inputs
/// to call must be greater or equal to the outputs. If the outputs exceed the
/// inputs then each subsequent call will take as many inputs as it needs from
/// the top of the intermediate stack. The net outputs to the stack will include
/// all the intermediate excess outputs as:
/// `outputs + (inputs - outputs) * n`
library OpLoopN {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        unchecked {
            uint256 n_ = Operand.unwrap(operand_) >> 12;
            uint256 inputs_ = Operand.unwrap(operand_) & MASK_4BIT;
            uint256 outputs_ = (Operand.unwrap(operand_) >> 4) & MASK_4BIT;
            if (outputs_ < inputs_) {
                revert InsufficientLoopOutputs(inputs_, outputs_);
            }
            Operand callOperand_ = Operand.wrap(
                Operand.unwrap(operand_) & MASK_12BIT
            );
            Pointer highwater_ = integrityCheckState_.stackHighwater;
            for (uint256 i_ = 0; i_ < n_; i_++) {
                // Ignore intermediate highwaters because call will set it past
                // the inputs and then the outputs each time.
                integrityCheckState_.stackHighwater = highwater_;
                stackTop_ = OpCall.integrity(
                    integrityCheckState_,
                    callOperand_,
                    stackTop_
                );
            }

            return stackTop_;
        }
    }

    function run(
        InterpreterState memory state_,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        uint256 n_ = Operand.unwrap(operand_) >> 12;
        Operand callOperand_ = Operand.wrap(
            Operand.unwrap(operand_) & MASK_12BIT
        );
        for (uint256 i_ = 0; i_ < n_; i_++) {
            stackTop_ = OpCall.run(state_, callOperand_, stackTop_);
        }
        return stackTop_;
    }
}
