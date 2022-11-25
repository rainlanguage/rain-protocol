// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";
import "./OpCall.sol";

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
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint n_ = Operand.unwrap(operand_) >> 12;
            uint inputs_ = Operand.unwrap(operand_) & MASK_4BIT;
            uint outputs_ = (Operand.unwrap(operand_) >> 4) & MASK_4BIT;
            require(inputs_ >= outputs_, "LOOP_N_INPUTS");
            Operand callOperand_ = Operand.wrap(
                Operand.unwrap(operand_) & MASK_12BIT
            );
            for (uint i_ = 0; i_ < n_; i_++) {
                stackTop_ = OpCall.integrity(
                    integrityState_,
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
        StackTop stackTop_
    ) internal view returns (StackTop) {
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
