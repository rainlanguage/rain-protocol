// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../../array/LibUint256Array.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpCall
/// @notice Opcode for calling eval with a new scope.
library OpCall {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 inputs_ = Operand.unwrap(operand_) & 0x7; // 00000111
        uint256 outputs_ = (Operand.unwrap(operand_) >> 3) & 0x3; // 00000011
        SourceIndex callSourceIndex_ = SourceIndex.wrap(
            (Operand.unwrap(operand_) >> 5) & 0x7 // 00000111
        );

        // Enter the call scope.
        StackTop stackBottom_ = integrityState_.stackBottom;
        integrityState_.stackBottom = integrityState_.pop(stackTop_, inputs_);
        integrityState_.ensureIntegrity(
            integrityState_,
            callSourceIndex_,
            stackTop_,
            outputs_
        );

        // Exit the call scope.
        stackTop_ = integrityState_.push(integrityState_.stackBottom, outputs_);
        integrityState_.stackBottom = stackBottom_;
        return stackTop_;
    }

    /// Call eval with a new scope.
    function call(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 inputs_ = Operand.unwrap(operand_) & 0x7; // 00000111
        uint256 outputs_ = (Operand.unwrap(operand_) >> 3) & 0x3; // 00000011
        SourceIndex callSourceIndex_ = SourceIndex.wrap(
            (Operand.unwrap(operand_) >> 5) & 0x7 // 00000111
        );
        stackTop_ = stackTop_.down(inputs_);
        StackTop stackTopAfter_ = state_.eval(
            state_,
            callSourceIndex_,
            stackTop_
        );
        LibUint256Array.unsafeCopyValuesTo(
            StackTop.unwrap(stackTopAfter_.down(outputs_)),
            StackTop.unwrap(stackTop_),
            outputs_
        );
        return stackTop_.up(outputs_);
    }
}
